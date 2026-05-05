import Database from "better-sqlite3";
import { now, uuid } from "./utils.js";
import type { Attachment } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface ChatRow {
  id: string;
  agentId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  promptCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface MessageRow {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  modelUsed: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  attachments: Attachment[] | null;
  createdAt: string;
}

export interface CreateChatInput {
  agentId: string;
  title?: string;
}

export interface InsertMessageInput {
  chatId: string;
  role: MessageRole;
  content: string;
  modelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  attachments?: Attachment[];
}

export interface GetChatResult {
  chat: ChatRow;
  messages: MessageRow[];
}

export interface ChatDb {
  createChat(input: CreateChatInput): ChatRow;
  listChats(agentId: string): ChatRow[];
  getChat(chatId: string): GetChatResult | undefined;
  deleteChat(chatId: string): void;
  insertMessage(input: InsertMessageInput): MessageRow;
  updateChatTitle(chatId: string, title: string): void;
}

// ── Internal types from SQLite ────────────────────────────────────────────

interface RawChat {
  id: string;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  prompt_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

interface RawMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  model_used: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  attachments: string | null;
  created_at: string;
}

function toChat(raw: RawChat): ChatRow {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    title: raw.title,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    promptCount: raw.prompt_count,
    totalPromptTokens: raw.total_prompt_tokens,
    totalCompletionTokens: raw.total_completion_tokens,
    totalTokens: raw.total_tokens,
  };
}

function toMessage(raw: RawMessage): MessageRow {
  return {
    id: raw.id,
    chatId: raw.chat_id,
    role: raw.role as MessageRole,
    content: raw.content,
    modelUsed: raw.model_used,
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
    attachments: raw.attachments ? JSON.parse(raw.attachments) : null,
    createdAt: raw.created_at,
  };
}



// ── Database creation ─────────────────────────────────────────────────────

const CREATE_CHAT_TABLE = `
  CREATE TABLE IF NOT EXISTS chats (
    id                      TEXT PRIMARY KEY,
    agent_id                TEXT NOT NULL,
    title                   TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    prompt_count            INTEGER NOT NULL DEFAULT 0,
    total_prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    total_completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens            INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_MESSAGE_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id                  TEXT PRIMARY KEY,
    chat_id             TEXT NOT NULL,
    role                TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content             TEXT NOT NULL CHECK(length(content) > 0),
    model_used          TEXT NOT NULL CHECK(length(model_used) > 0),
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    total_tokens        INTEGER,
    attachments         TEXT,
    created_at          TEXT NOT NULL
  );
`;

const CREATE_CHAT_INDEX = `CREATE INDEX IF NOT EXISTS idx_chats_agent_date ON chats(agent_id, updated_at DESC);`;
const CREATE_MESSAGE_INDEX = `CREATE INDEX IF NOT EXISTS idx_messages_chat_date ON messages(chat_id, created_at);`;

export function createChatDatabase(db: Database.Database): ChatDb {
  db.exec(CREATE_CHAT_TABLE);
  db.exec(CREATE_MESSAGE_TABLE);
  db.exec(CREATE_CHAT_INDEX);
  db.exec(CREATE_MESSAGE_INDEX);

  const insertChatStmt = db.prepare(
    "INSERT INTO chats (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const listChatsStmt = db.prepare(
    "SELECT * FROM chats WHERE agent_id = ? ORDER BY updated_at DESC"
  );
  const getChatStmt = db.prepare("SELECT * FROM chats WHERE id = ?");
  const deleteChatStmt = db.prepare("DELETE FROM chats WHERE id = ?");

  const insertMsgStmt = db.prepare(
    "INSERT INTO messages (id, chat_id, role, content, model_used, prompt_tokens, completion_tokens, total_tokens, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateTotalsStmt = db.prepare(
    `UPDATE chats SET
       total_prompt_tokens = total_prompt_tokens + COALESCE(?, 0),
       total_completion_tokens = total_completion_tokens + COALESCE(?, 0),
       total_tokens = total_tokens + COALESCE(?, 0),
       updated_at = ?
     WHERE id = ?`
  );
  const getMessagesStmt = db.prepare(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC"
  );
  const chatExistsStmt = db.prepare("SELECT 1 FROM chats WHERE id = ?");
  const agentExistsStmt = db.prepare("SELECT 1 FROM agents WHERE id = ?");
  const messageCountStmt = db.prepare("SELECT COUNT(*) as count FROM messages WHERE chat_id = ?");
  const incrementPromptStmt = db.prepare(
    "UPDATE chats SET prompt_count = prompt_count + 1 WHERE id = ?"
  );
  const updateTitleStmt = db.prepare(
    "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?"
  );

  return {
    createChat(input: CreateChatInput): ChatRow {
      // Validate agent exists (manual FK since the agents table lives in a sibling module)
      const agentExists = agentExistsStmt.get(input.agentId);
      if (!agentExists) {
        throw new Error(`Agent not found: ${input.agentId}`);
      }

      const ts = now();
      const id = uuid();
      insertChatStmt.run(id, input.agentId, input.title ?? null, ts, ts);
      const raw = getChatStmt.get(id) as RawChat;
      return toChat(raw);
    },

    listChats(agentId: string): ChatRow[] {
      const rows = listChatsStmt.all(agentId) as RawChat[];
      return rows.map(toChat);
    },

    getChat(chatId: string): GetChatResult | undefined {
      const rawChat = getChatStmt.get(chatId) as RawChat | undefined;
      if (!rawChat) return undefined;

      const rawMessages = getMessagesStmt.all(chatId) as RawMessage[];
      return {
        chat: toChat(rawChat),
        messages: rawMessages.map(toMessage),
      };
    },

    deleteChat(chatId: string): void {
      const existing = getChatStmt.get(chatId);
      if (!existing) {
        throw new Error(`Chat not found: ${chatId}`);
      }
      // Messages cascade delete implicitly via shared in-memory DB structure
      db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
      deleteChatStmt.run(chatId);
    },

    updateChatTitle(chatId: string, title: string): void {
      const existing = getChatStmt.get(chatId);
      if (!existing) {
        throw new Error(`Chat not found: ${chatId}`);
      }
      updateTitleStmt.run(title, now(), chatId);
    },

    insertMessage(input: InsertMessageInput): MessageRow {
      const chatExists = chatExistsStmt.get(input.chatId);
      if (!chatExists) {
        throw new Error(`Chat not found: ${input.chatId}`);
      }

      const msgId = uuid();
      const ts = now();
      const pt = input.promptTokens ?? null;
      const ct = input.completionTokens ?? null;
      const tt = input.totalTokens ?? null;

      const transaction = db.transaction(() => {
        insertMsgStmt.run(
          msgId,
          input.chatId,
          input.role,
          input.content,
          input.modelUsed,
          pt,
          ct,
          tt,
          input.attachments ? JSON.stringify(input.attachments) : null,
          ts
        );
        updateTotalsStmt.run(pt, ct, tt, ts, input.chatId);
        // Increment prompt count for user messages
        if (input.role === "user") {
          incrementPromptStmt.run(input.chatId);
        }
      });

      transaction();

      // Return the inserted message
      const stmt = db.prepare("SELECT * FROM messages WHERE id = ?");
      const raw = stmt.get(msgId) as RawMessage;
      return toMessage(raw);
    },
  };
}
