import Database from "better-sqlite3";
import { now, uuid } from "./utils.js";
import type { Attachment } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────────

export type SenderType = "user" | "agent";

export interface WorkspaceChatRow {
  id: string;
  workspaceId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  promptCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface WorkspaceMessageRow {
  id: string;
  workspaceChatId: string;
  senderType: SenderType;
  senderId: string | null;
  content: string;
  timestamp: string;
  modelUsed: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  attachments: Attachment[] | null;
}

export interface CreateWorkspaceChatInput {
  workspaceId: string;
  title?: string;
}

export interface AddMessageInput {
  workspaceChatId: string;
  senderType: SenderType;
  senderId: string | null;
  content: string;
  modelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  attachments?: Attachment[];
}

export interface GetWorkspaceChatResult {
  chat: WorkspaceChatRow;
  messages: WorkspaceMessageRow[];
}

export interface WorkspaceChatsDb {
  createChat(input: CreateWorkspaceChatInput): WorkspaceChatRow;
  getChat(chatId: string): GetWorkspaceChatResult | undefined;
  listChats(workspaceId: string): WorkspaceChatRow[];
  addMessage(input: AddMessageInput): WorkspaceMessageRow;
  getMessages(chatId: string): WorkspaceMessageRow[];
  updateChatTitle(chatId: string, title: string): void;
}

// ── Internal types from SQLite ────────────────────────────────────────────

interface RawWorkspaceChat {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  prompt_count: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

interface RawWorkspaceMessage {
  id: string;
  workspace_chat_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  timestamp: string;
  model_used: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  attachments: string | null;
}

function toWorkspaceChat(raw: RawWorkspaceChat): WorkspaceChatRow {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    title: raw.title,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    promptCount: raw.prompt_count,
    totalPromptTokens: raw.total_prompt_tokens,
    totalCompletionTokens: raw.total_completion_tokens,
    totalTokens: raw.total_tokens,
  };
}

function toWorkspaceMessage(raw: RawWorkspaceMessage): WorkspaceMessageRow {
  return {
    id: raw.id,
    workspaceChatId: raw.workspace_chat_id,
    senderType: raw.sender_type as SenderType,
    senderId: raw.sender_id,
    content: raw.content,
    timestamp: raw.timestamp,
    modelUsed: raw.model_used,
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
    attachments: raw.attachments ? JSON.parse(raw.attachments) : null,
  };
}



// ── Database creation ─────────────────────────────────────────────────────

const CREATE_WORKSPACE_CHATS_TABLE = `
  CREATE TABLE IF NOT EXISTS workspace_chats (
    id                      TEXT PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    title                   TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    prompt_count            INTEGER NOT NULL DEFAULT 0,
    total_prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    total_completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens            INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_WORKSPACE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS workspace_messages (
    id                  TEXT PRIMARY KEY,
    workspace_chat_id   TEXT NOT NULL,
    sender_type         TEXT NOT NULL CHECK(sender_type IN ('user', 'agent')),
    sender_id           TEXT,
    content             TEXT NOT NULL CHECK(length(content) > 0),
    timestamp           TEXT NOT NULL,
    model_used          TEXT NOT NULL,
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    total_tokens        INTEGER,
    attachments         TEXT
  );
`;

const CREATE_WORKSPACE_CHATS_INDEX = `CREATE INDEX IF NOT EXISTS idx_workspace_chats_ws_date ON workspace_chats(workspace_id, updated_at DESC);`;
const CREATE_WORKSPACE_MESSAGES_INDEX = `CREATE INDEX IF NOT EXISTS idx_workspace_messages_chat_ts ON workspace_messages(workspace_chat_id, timestamp);`;

export function createWorkspaceChatsDatabase(db: Database.Database): WorkspaceChatsDb {
  db.exec(CREATE_WORKSPACE_CHATS_TABLE);
  db.exec(CREATE_WORKSPACE_MESSAGES_TABLE);
  db.exec(CREATE_WORKSPACE_CHATS_INDEX);
  db.exec(CREATE_WORKSPACE_MESSAGES_INDEX);

  // ── Prepared statements ────────────────────────────────────────────────

  const workspaceExistsStmt = db.prepare("SELECT 1 FROM workspaces WHERE id = ?");
  const insertChatStmt = db.prepare(
    "INSERT INTO workspace_chats (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const getChatStmt = db.prepare("SELECT * FROM workspace_chats WHERE id = ?");
  const listChatsStmt = db.prepare(
    "SELECT * FROM workspace_chats WHERE workspace_id = ? ORDER BY updated_at DESC"
  );
  const chatExistsStmt = db.prepare("SELECT 1 FROM workspace_chats WHERE id = ?");

  const insertMsgStmt = db.prepare(
    "INSERT INTO workspace_messages (id, workspace_chat_id, sender_type, sender_id, content, timestamp, model_used, prompt_tokens, completion_tokens, total_tokens, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateTotalsStmt = db.prepare(
    `UPDATE workspace_chats SET
       total_prompt_tokens = total_prompt_tokens + COALESCE(?, 0),
       total_completion_tokens = total_completion_tokens + COALESCE(?, 0),
       total_tokens = total_tokens + COALESCE(?, 0),
       updated_at = ?
     WHERE id = ?`
  );
  const incrementPromptStmt = db.prepare(
    "UPDATE workspace_chats SET prompt_count = prompt_count + 1 WHERE id = ?"
  );
  const getMessagesStmt = db.prepare(
    "SELECT * FROM workspace_messages WHERE workspace_chat_id = ? ORDER BY timestamp ASC"
  );
  const updateTitleStmt = db.prepare(
    "UPDATE workspace_chats SET title = ?, updated_at = ? WHERE id = ?"
  );

  return {
    createChat(input: CreateWorkspaceChatInput): WorkspaceChatRow {
      const workspaceExists = workspaceExistsStmt.get(input.workspaceId);
      if (!workspaceExists) {
        throw new Error(`Workspace not found: ${input.workspaceId}`);
      }

      const ts = now();
      const id = uuid();
      insertChatStmt.run(id, input.workspaceId, input.title ?? null, ts, ts);
      const raw = getChatStmt.get(id) as RawWorkspaceChat;
      return toWorkspaceChat(raw);
    },

    getChat(chatId: string): GetWorkspaceChatResult | undefined {
      const rawChat = getChatStmt.get(chatId) as RawWorkspaceChat | undefined;
      if (!rawChat) return undefined;

      const rawMessages = getMessagesStmt.all(chatId) as RawWorkspaceMessage[];
      return {
        chat: toWorkspaceChat(rawChat),
        messages: rawMessages.map(toWorkspaceMessage),
      };
    },

    listChats(workspaceId: string): WorkspaceChatRow[] {
      const rows = listChatsStmt.all(workspaceId) as RawWorkspaceChat[];
      return rows.map(toWorkspaceChat);
    },

    addMessage(input: AddMessageInput): WorkspaceMessageRow {
      const chatExists = chatExistsStmt.get(input.workspaceChatId);
      if (!chatExists) {
        throw new Error(`Workspace chat not found: ${input.workspaceChatId}`);
      }

      const msgId = uuid();
      const ts = now();
      const pt = input.promptTokens ?? null;
      const ct = input.completionTokens ?? null;
      const tt = input.totalTokens ?? null;

      const transaction = db.transaction(() => {
        insertMsgStmt.run(
          msgId,
          input.workspaceChatId,
          input.senderType,
          input.senderId,
          input.content,
          ts,
          input.modelUsed,
          pt,
          ct,
          tt,
          input.attachments ? JSON.stringify(input.attachments) : null,
        );
        updateTotalsStmt.run(pt, ct, tt, ts, input.workspaceChatId);
        if (input.senderType === "user") {
          incrementPromptStmt.run(input.workspaceChatId);
        }
      });

      transaction();

      const stmt = db.prepare("SELECT * FROM workspace_messages WHERE id = ?");
      const raw = stmt.get(msgId) as RawWorkspaceMessage;
      return toWorkspaceMessage(raw);
    },

    getMessages(chatId: string): WorkspaceMessageRow[] {
      const rows = getMessagesStmt.all(chatId) as RawWorkspaceMessage[];
      return rows.map(toWorkspaceMessage);
    },

    updateChatTitle(chatId: string, title: string): void {
      const ts = now();
      updateTitleStmt.run(title, ts, chatId);
    },
  };
}
