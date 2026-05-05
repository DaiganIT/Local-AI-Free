import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createChatDatabase } from "../src/chat-db.js";
import { createDatabase } from "../src/agents-db.js";
import Database from "better-sqlite3";

describe("chat-db", () => {
  let chatDb: ReturnType<typeof createChatDatabase>;
  let sqlite: Database.Database;
  let agentDb: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    sqlite = new Database(":memory:");
    // We need the agents table for FK support, so create it too
    agentDb = createDatabase(sqlite);
    chatDb = createChatDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("init", () => {
    it("creates the chats table", () => {
      const tableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chats'")
        .get();
      expect(tableExists).toBeDefined();
    });

    it("creates the messages table", () => {
      const tableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
        .get();
      expect(tableExists).toBeDefined();
    });

    it("creates the idx_chats_agent_date index", () => {
      const idx = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chats_agent_date'")
        .get();
      expect(idx).toBeDefined();
    });

    it("creates the idx_messages_chat_date index", () => {
      const idx = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_chat_date'")
        .get();
      expect(idx).toBeDefined();
    });
  });

  describe("createChat", () => {
    it("creates a chat and returns it with id and timestamps", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });

      const chat = chatDb.createChat({
        agentId: agent.id,
        title: "First conversation",
      });

      expect(chat.id).toBeDefined();
      expect(chat.agentId).toBe(agent.id);
      expect(chat.title).toBe("First conversation");
      expect(chat.createdAt).toBeDefined();
      expect(chat.updatedAt).toBeDefined();
      expect(chat.totalPromptTokens).toBe(0);
      expect(chat.totalCompletionTokens).toBe(0);
      expect(chat.totalTokens).toBe(0);
    });

    it("creates a chat without a title", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });

      const chat = chatDb.createChat({ agentId: agent.id });

      expect(chat.title).toBeNull();
    });

    it("throws if agent does not exist", () => {
      expect(() =>
        chatDb.createChat({ agentId: "non-existent-agent" })
      ).toThrow();
    });
  });

  describe("listChats", () => {
    it("returns all chats for an agent ordered by updated_at DESC", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });

      const a = chatDb.createChat({ agentId: agent.id, title: "Old chat" });
      vi.advanceTimersByTime(1000);
      const b = chatDb.createChat({ agentId: agent.id, title: "Newer chat" });
      vi.advanceTimersByTime(1000);
      const c = chatDb.createChat({ agentId: agent.id, title: "Newest chat" });

      const list = chatDb.listChats(agent.id);

      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(c.id);
      expect(list[1].id).toBe(b.id);
      expect(list[2].id).toBe(a.id);
    });

    it("returns empty array when agent has no chats", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      expect(chatDb.listChats(agent.id)).toHaveLength(0);
    });

    it("only returns chats for the given agent", () => {
      const agent1 = agentDb.createAgent({ name: "A", model: "llama3.2" });
      const agent2 = agentDb.createAgent({ name: "B", model: "llama3.2" });

      chatDb.createChat({ agentId: agent1.id, title: "Agent A chat" });
      chatDb.createChat({ agentId: agent2.id, title: "Agent B chat" });

      const list1 = chatDb.listChats(agent1.id);
      const list2 = chatDb.listChats(agent2.id);

      expect(list1).toHaveLength(1);
      expect(list2).toHaveLength(1);
      expect(list1[0].title).toBe("Agent A chat");
      expect(list2[0].title).toBe("Agent B chat");
    });
  });

  describe("getChat", () => {
    it("returns a chat with its messages ordered by created_at", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test chat" });

      vi.advanceTimersByTime(1000);
      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Hello!",
        modelUsed: "llama3.2",
      });

      vi.advanceTimersByTime(1000);
      chatDb.insertMessage({
        chatId: chat.id,
        role: "assistant",
        content: "Hi there!",
        modelUsed: "llama3.2",
      });

      const result = chatDb.getChat(chat.id);

      expect(result).toBeDefined();
      expect(result!.chat.id).toBe(chat.id);
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].content).toBe("Hello!");
      expect(result!.messages[1].content).toBe("Hi there!");
    });

    it("returns undefined for non-existent chat", () => {
      const result = chatDb.getChat("non-existent-chat");
      expect(result).toBeUndefined();
    });
  });

  describe("deleteChat", () => {
    it("deletes a chat and its messages", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "To delete" });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Hello",
        modelUsed: "llama3.2",
      });

      chatDb.deleteChat(chat.id);

      expect(chatDb.getChat(chat.id)).toBeUndefined();
      expect(chatDb.listChats(agent.id)).toHaveLength(0);
    });

    it("throws for non-existent chat", () => {
      expect(() => chatDb.deleteChat("non-existent-chat")).toThrow();
    });
  });

  describe("insertMessage", () => {
    it("increments promptCount when inserting a user message", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Hello",
        modelUsed: "llama3.2",
      });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "assistant",
        content: "Hi there!",
        modelUsed: "llama3.2",
      });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "How are you?",
        modelUsed: "llama3.2",
      });

      const result = chatDb.getChat(chat.id);
      expect(result!.chat.promptCount).toBe(2); // only user messages
    });

    it("inserts a user message", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      const msg = chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "What is 2+2?",
        modelUsed: "llama3.2",
      });

      expect(msg.id).toBeDefined();
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("What is 2+2?");
      expect(msg.modelUsed).toBe("llama3.2");
      expect(msg.createdAt).toBeDefined();
    });

    it("inserts a message with token counts", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      const msg = chatDb.insertMessage({
        chatId: chat.id,
        role: "assistant",
        content: "4!",
        modelUsed: "llama3.2",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });

      expect(msg.promptTokens).toBe(10);
      expect(msg.completionTokens).toBe(5);
      expect(msg.totalTokens).toBe(15);
    });

    it("updates chat totals after inserting a message", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Hello",
        modelUsed: "llama3.2",
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
      });

      chatDb.insertMessage({
        chatId: chat.id,
        role: "assistant",
        content: "Hi!",
        modelUsed: "llama3.2",
        promptTokens: 15,
        completionTokens: 5,
        totalTokens: 20,
      });

      const result = chatDb.getChat(chat.id);

      expect(result!.chat.totalPromptTokens).toBe(25);
      expect(result!.chat.totalCompletionTokens).toBe(5);
      expect(result!.chat.totalTokens).toBe(30);
    });

    it("updates chat updated_at timestamp after inserting a message", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });
      const before = chat.updatedAt;

      vi.advanceTimersByTime(1000);

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Hello",
        modelUsed: "llama3.2",
      });

      const result = chatDb.getChat(chat.id);
      expect(result!.chat.updatedAt).not.toBe(before);
    });

    it("throws for non-existent chat", () => {
      expect(() =>
        chatDb.insertMessage({
          chatId: "non-existent-chat",
          role: "user",
          content: "Hello",
          modelUsed: "llama3.2",
        })
      ).toThrow();
    });

    it("inserts a message with attachments", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      const attachments = [
        { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
        { name: "notes.txt", path: "uploads/notes.txt", size: 256 },
      ];

      const msg = chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "Check these files",
        modelUsed: "llama3.2",
        attachments,
      });

      expect(msg.attachments).toEqual(attachments);
    });

    it("inserts a message without attachments (null)", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      const msg = chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "No attachments here",
        modelUsed: "llama3.2",
      });

      expect(msg.attachments).toBeNull();
    });

    it("persists attachments and reads them back", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });

      const attachments = [
        { name: "data.csv", path: "uploads/data.csv", size: 4096 },
      ];

      chatDb.insertMessage({
        chatId: chat.id,
        role: "user",
        content: "See attached",
        modelUsed: "llama3.2",
        attachments,
      });

      const result = chatDb.getChat(chat.id);
      expect(result!.messages[0].attachments).toEqual(attachments);
    });
  });

  describe("updateChatTitle", () => {
    it("updates the title of an existing chat", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id });

      expect(chat.title).toBeNull();

      chatDb.updateChatTitle(chat.id, "New title");

      const result = chatDb.getChat(chat.id);
      expect(result!.chat.title).toBe("New title");
    });

    it("updates the updated_at timestamp when changing the title", () => {
      const agent = agentDb.createAgent({ name: "Helper", model: "llama3.2" });
      const chat = chatDb.createChat({ agentId: agent.id, title: "Old" });
      const before = chat.updatedAt;

      vi.advanceTimersByTime(1000);

      chatDb.updateChatTitle(chat.id, "New");

      const result = chatDb.getChat(chat.id);
      expect(result!.chat.updatedAt).not.toBe(before);
    });

    it("throws for non-existent chat", () => {
      expect(() => chatDb.updateChatTitle("non-existent-chat", "Title")).toThrow();
    });
  });
});
