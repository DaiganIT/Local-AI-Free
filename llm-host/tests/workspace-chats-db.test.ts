import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWorkspaceChatsDatabase } from "../src/workspace-chats-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import Database from "better-sqlite3";

describe("workspace-chats-db", () => {
  let wchatDb: ReturnType<typeof createWorkspaceChatsDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let sqlite: Database.Database;

  beforeEach(() => {
    vi.useFakeTimers();
    sqlite = new Database(":memory:");
    wdb = createWorkspacesDatabase(sqlite);
    wchatDb = createWorkspaceChatsDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── table creation ────────────────────────────────────────────────────────

  describe("init", () => {
    it("creates the workspace_chats table", () => {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_chats'")
        .get();
      expect(table).toBeDefined();
    });

    it("creates the workspace_messages table", () => {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_messages'")
        .get();
      expect(table).toBeDefined();
    });
  });

  // ── createChat ────────────────────────────────────────────────────────────

  describe("createChat", () => {
    it("creates a workspace chat and returns it with id and timestamps", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      expect(chat.id).toBeDefined();
      expect(chat.workspaceId).toBe(ws.id);
      expect(chat.title).toBeNull();
      expect(chat.createdAt).toBeDefined();
      expect(chat.updatedAt).toBeDefined();
      expect(chat.promptCount).toBe(0);
      expect(chat.totalPromptTokens).toBe(0);
      expect(chat.totalCompletionTokens).toBe(0);
      expect(chat.totalTokens).toBe(0);
    });

    it("creates a workspace chat with a title", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id, title: "Round table" });

      expect(chat.title).toBe("Round table");
    });

    it("throws if workspace does not exist", () => {
      expect(() =>
        wchatDb.createChat({ workspaceId: "non-existent-workspace" })
      ).toThrow();
    });
  });

  // ── getChat ───────────────────────────────────────────────────────────────

  describe("getChat", () => {
    it("returns a workspace chat by id with its messages", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id, title: "Discussion" });

      vi.advanceTimersByTime(1000);
      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Hello agents!",
        modelUsed: "",
      });

      vi.advanceTimersByTime(1000);
      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-1",
        content: "Hello human!",
        modelUsed: "llama3.2",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });

      const result = wchatDb.getChat(chat.id);

      expect(result).toBeDefined();
      expect(result!.chat.id).toBe(chat.id);
      expect(result!.chat.title).toBe("Discussion");
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].content).toBe("Hello agents!");
      expect(result!.messages[0].senderType).toBe("user");
      expect(result!.messages[1].content).toBe("Hello human!");
      expect(result!.messages[1].senderType).toBe("agent");
      expect(result!.messages[1].senderId).toBe("agent-1");
    });

    it("returns undefined for non-existent chat", () => {
      expect(wchatDb.getChat("non-existent-chat")).toBeUndefined();
    });
  });

  // ── listChats ─────────────────────────────────────────────────────────────

  describe("listChats", () => {
    it("returns all chats for a workspace ordered by updated_at DESC", () => {
      const ws = wdb.createWorkspace({ name: "Team" });

      const a = wchatDb.createChat({ workspaceId: ws.id, title: "First" });
      vi.advanceTimersByTime(1000);
      const b = wchatDb.createChat({ workspaceId: ws.id, title: "Second" });
      vi.advanceTimersByTime(1000);
      const c = wchatDb.createChat({ workspaceId: ws.id, title: "Third" });

      const list = wchatDb.listChats(ws.id);

      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(c.id);
      expect(list[1].id).toBe(b.id);
      expect(list[2].id).toBe(a.id);
    });

    it("returns empty array when workspace has no chats", () => {
      const ws = wdb.createWorkspace({ name: "Empty" });
      expect(wchatDb.listChats(ws.id)).toHaveLength(0);
    });

    it("only returns chats for the given workspace", () => {
      const ws1 = wdb.createWorkspace({ name: "Alpha" });
      const ws2 = wdb.createWorkspace({ name: "Beta" });

      wchatDb.createChat({ workspaceId: ws1.id, title: "Alpha chat" });
      wchatDb.createChat({ workspaceId: ws2.id, title: "Beta chat" });

      const list1 = wchatDb.listChats(ws1.id);
      const list2 = wchatDb.listChats(ws2.id);

      expect(list1).toHaveLength(1);
      expect(list2).toHaveLength(1);
      expect(list1[0].title).toBe("Alpha chat");
      expect(list2[0].title).toBe("Beta chat");
    });
  });

  // ── addMessage ────────────────────────────────────────────────────────────

  describe("addMessage", () => {
    it("adds a user message", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      const msg = wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Hey everyone!",
        modelUsed: "",
      });

      expect(msg.id).toBeDefined();
      expect(msg.workspaceChatId).toBe(chat.id);
      expect(msg.senderType).toBe("user");
      expect(msg.senderId).toBeNull();
      expect(msg.content).toBe("Hey everyone!");
      expect(msg.modelUsed).toBe("");
      expect(msg.promptTokens).toBeNull();
      expect(msg.completionTokens).toBeNull();
      expect(msg.totalTokens).toBeNull();
      expect(msg.timestamp).toBeDefined();
    });

    it("adds an agent message with token counts", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      const msg = wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-1",
        content: "I can help!",
        modelUsed: "llama3.2",
        promptTokens: 20,
        completionTokens: 8,
        totalTokens: 28,
      });

      expect(msg.senderType).toBe("agent");
      expect(msg.senderId).toBe("agent-1");
      expect(msg.modelUsed).toBe("llama3.2");
      expect(msg.promptTokens).toBe(20);
      expect(msg.completionTokens).toBe(8);
      expect(msg.totalTokens).toBe(28);
    });

    it("updates chat token totals after adding a message", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Hello",
        modelUsed: "",
        promptTokens: 10,
        totalTokens: 10,
      });

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-1",
        content: "Hi!",
        modelUsed: "llama3.2",
        promptTokens: 15,
        completionTokens: 5,
        totalTokens: 20,
      });

      const result = wchatDb.getChat(chat.id);

      expect(result!.chat.totalPromptTokens).toBe(25);
      expect(result!.chat.totalCompletionTokens).toBe(5);
      expect(result!.chat.totalTokens).toBe(30);
    });

    it("increments promptCount for user messages only", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Hello",
        modelUsed: "",
      });

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-1",
        content: "Hi!",
        modelUsed: "llama3.2",
      });

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "How are you?",
        modelUsed: "",
      });

      const result = wchatDb.getChat(chat.id);
      expect(result!.chat.promptCount).toBe(2);
    });

    it("updates chat updated_at timestamp after adding a message", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });
      const before = chat.updatedAt;

      vi.advanceTimersByTime(1000);

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Hello",
        modelUsed: "",
      });

      const result = wchatDb.getChat(chat.id);
      expect(result!.chat.updatedAt).not.toBe(before);
    });

    it("throws for non-existent chat", () => {
      expect(() =>
        wchatDb.addMessage({
          workspaceChatId: "non-existent-chat",
          senderType: "user",
          senderId: null,
          content: "Hello",
          modelUsed: "",
        })
      ).toThrow();
    });

    it("throws if content is empty", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      expect(() =>
        wchatDb.addMessage({
          workspaceChatId: chat.id,
          senderType: "user",
          senderId: null,
          content: "",
          modelUsed: "",
        })
      ).toThrow();
    });

    it("adds a message with attachments", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      const attachments = [
        { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
        { name: "notes.txt", path: "uploads/notes.txt", size: 256 },
      ];

      const msg = wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Check these files",
        modelUsed: "",
        attachments,
      });

      expect(msg.attachments).toEqual(attachments);
    });

    it("adds a message without attachments (null)", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      const msg = wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "No attachments here",
        modelUsed: "",
      });

      expect(msg.attachments).toBeNull();
    });

    it("persists attachments and reads them back", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      const attachments = [
        { name: "data.csv", path: "uploads/data.csv", size: 4096 },
      ];

      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "See attached",
        modelUsed: "",
        attachments,
      });

      const result = wchatDb.getChat(chat.id);
      expect(result!.messages[0].attachments).toEqual(attachments);
    });
  });

  // ── updateChatTitle ───────────────────────────────────────────────────────

  describe("updateChatTitle", () => {
    it("updates the title of a workspace chat", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });
      expect(chat.title).toBeNull();

      wchatDb.updateChatTitle(chat.id, "New Title");

      const result = wchatDb.getChat(chat.id);
      expect(result!.chat.title).toBe("New Title");
    });

    it("updates the updated_at timestamp", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });
      const before = chat.updatedAt;

      vi.advanceTimersByTime(1000);
      wchatDb.updateChatTitle(chat.id, "Updated");

      const result = wchatDb.getChat(chat.id);
      expect(result!.chat.updatedAt).not.toBe(before);
    });
  });

  // ── getMessages ───────────────────────────────────────────────────────────

  describe("getMessages", () => {
    it("returns all messages for a chat ordered by timestamp ASC", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      vi.advanceTimersByTime(1000);
      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "user",
        senderId: null,
        content: "Question",
        modelUsed: "",
      });

      vi.advanceTimersByTime(1000);
      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-1",
        content: "Answer from 1",
        modelUsed: "llama3.2",
      });

      vi.advanceTimersByTime(1000);
      wchatDb.addMessage({
        workspaceChatId: chat.id,
        senderType: "agent",
        senderId: "agent-2",
        content: "Answer from 2",
        modelUsed: "mistral",
      });

      const msgs = wchatDb.getMessages(chat.id);

      expect(msgs).toHaveLength(3);
      expect(msgs[0].content).toBe("Question");
      expect(msgs[1].content).toBe("Answer from 1");
      expect(msgs[2].content).toBe("Answer from 2");
    });

    it("returns empty array for chat with no messages", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      const chat = wchatDb.createChat({ workspaceId: ws.id });

      expect(wchatDb.getMessages(chat.id)).toHaveLength(0);
    });
  });
});
