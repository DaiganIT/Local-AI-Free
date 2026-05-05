import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createChatDatabase } from "../src/chat-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import { createWorkspaceChatsDatabase } from "../src/workspace-chats-db.js";
import Database from "better-sqlite3";
import * as agentFolderTree from "../src/agent-folder-tree.js";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe("chat handlers", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatDb: ReturnType<typeof createChatDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let wchatDb: ReturnType<typeof createWorkspaceChatsDatabase>;
  let sqliteDb: Database.Database;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatDb = createChatDatabase(sqliteDb);
    wdb = createWorkspacesDatabase(sqliteDb);
    wchatDb = createWorkspaceChatsDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(readFileSync).mockClear();
  });

  it("creates a chat when action is create-chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "create-chat",
      payload: { agentId: agent.id, title: "Test chat" },
      id: "10",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ agentId: agent.id, title: "Test chat" });
  });
  it("returns error when create-chat agent does not exist", async () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "create-chat",
      payload: { agentId: "non-existent", title: "Test" },
      id: "11",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("Agent not found");
  });
  it("lists chats when action is list-chats", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    chatDb.createChat({ agentId: agent.id, title: "Chat 1" });
    chatDb.createChat({ agentId: agent.id, title: "Chat 2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "list-chats",
      payload: { agentId: agent.id },
      id: "12",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as Array<unknown>).length).toBe(2);
  });
  it("list-chats returns promptCount and token totals for each chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Test chat" });

    // Simulate a conversation: 2 user messages + 2 assistant responses
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Hello", modelUsed: agent.model, promptTokens: 10, completionTokens: 0, totalTokens: 10 });
    chatDb.insertMessage({ chatId: chat.id, role: "assistant", content: "Hi!", modelUsed: agent.model, promptTokens: 15, completionTokens: 5, totalTokens: 20 });
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "How are you?", modelUsed: agent.model });
    chatDb.insertMessage({ chatId: chat.id, role: "assistant", content: "Great!", modelUsed: agent.model, promptTokens: 20, completionTokens: 4, totalTokens: 24 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "list-chats",
      payload: { agentId: agent.id },
      id: "list-totals",
      send,
      db,
      chatDb,
      chatResponse,
    });

    const chats = (result[0] as Record<string, unknown>).data as Array<Record<string, unknown>>;
    expect(chats).toHaveLength(1);
    expect(chats[0].promptCount).toBe(2); // 2 user messages
    expect(chats[0].totalPromptTokens).toBe(45); // 10 + 15 + 0 + 20
    expect(chats[0].totalCompletionTokens).toBe(9); // 0 + 5 + 0 + 4
    expect(chats[0].totalTokens).toBe(54); // 10 + 20 + 0 + 24
  });
  it("returns a chat with messages when action is get-chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Hello", modelUsed: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "get-chat",
      payload: { chatId: chat.id },
      id: "13",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).chat).toBeDefined();
    expect((response.data as Record<string, unknown>).messages).toBeDefined();
    expect(((response.data as Record<string, unknown>).messages as Array<unknown>).length).toBe(1);
  });
  it("deletes a chat when action is delete-chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "To delete" });
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Hello", modelUsed: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "delete-chat",
      payload: { chatId: chat.id },
      id: "15",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(chatDb.getChat(chat.id)).toBeUndefined();
  });
  it("returns error when delete-chat chat does not exist", async () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "delete-chat",
      payload: { chatId: "non-existent" },
      id: "16",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not found");
  });
  it("derives chat title from the first message when sending to a pre-created untitled chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id }); // no title
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hello there friend", chatId: chat.id },
      id: "24",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.chat.title).toBe("Hello there friend");
    expect(chatResult!.messages).toHaveLength(2);
  });
  it("derives truncated chat title when first message exceeds 50 chars", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id }); // no title
    chatResponse.mockResolvedValue({ content: "Hi!" });
    const longPrompt = "What is the difference between functional and object-oriented programming languages in terms of data mutation?";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: longPrompt, chatId: chat.id },
      id: "25",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.chat.title).toBe("What is the difference between functional and obje…");
    expect(chatResult!.chat.title?.length).toBe(51); // 50 chars + ellipsis
  });
  it("does NOT change chat title on messages after the first", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Existing title" });
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Old message", modelUsed: agent.model });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "This should not become the title", chatId: chat.id },
      id: "26",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.chat.title).toBe("Existing title");
  });
  it("returns contextUsed and contextLength in get-chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Context test" });

    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Hello", modelUsed: agent.model });
    chatDb.insertMessage({ chatId: chat.id, role: "assistant", content: "Hi!", modelUsed: agent.model, promptTokens: 61, completionTokens: 826, totalTokens: 887 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "get-chat",
      payload: { chatId: chat.id },
      id: "ctx-1",
      send,
      db,
      chatDb,
      contextLengthFor: (model: string) => model === "llama3.2" ? 8192 : undefined,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ contextUsed: 887, contextLength: 8192 });
  });
  it("returns undefined contextUsed when chat has no messages", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Empty" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "get-chat",
      payload: { chatId: chat.id },
      id: "ctx-2",
      send,
      db,
      chatDb,
      contextLengthFor: () => 8192,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ contextUsed: undefined, contextLength: 8192 });
  });
  it("accumulates totals correctly across multiple messages", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Multi" });

    // First exchange: prompt=42, completion=8
    chatResponse.mockResolvedValueOnce({ content: "First", promptTokens: 42, completionTokens: 8 });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Q1", chatId: chat.id },
      id: "t-multi-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    // Second exchange: prompt=60 (conversation is longer now), completion=12
    chatResponse.mockResolvedValue({ content: "Second", promptTokens: 60, completionTokens: 12 });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Q2", chatId: chat.id },
      id: "t-multi-2",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    const chatResult = chatDb.getChat(chat.id);
    // 4 messages: user1, assistant1, user2, assistant2
    expect(chatResult!.messages).toHaveLength(4);

    // Totals should be: prompt = 0(user1) + 42(asst1) + 0(user2) + 60(asst2) = 102
    // completion = 0 + 8 + 0 + 12 = 20
    // total = 122
    expect(chatResult!.chat.totalPromptTokens).toBe(102);
    expect(chatResult!.chat.totalCompletionTokens).toBe(20);
    expect(chatResult!.chat.totalTokens).toBe(122);
  });
  it("derives chat title from first user message when chat is empty", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "Hi!", promptTokens: 5, completionTokens: 3 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "What is the meaning of life?", agentIds: [agent.id] },
      id: "wsm-12",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.chat.title).toBe("What is the meaning of life?");
  });
  it("derives truncated chat title when first message exceeds 50 chars", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "Hi!", promptTokens: 5, completionTokens: 3 });
    const longPrompt = "What is the difference between functional and object-oriented programming languages in terms of data mutation?";

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: longPrompt, agentIds: [agent.id] },
      id: "wsm-13",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.chat.title).toBe("What is the difference between functional and obje…");
  });
});
