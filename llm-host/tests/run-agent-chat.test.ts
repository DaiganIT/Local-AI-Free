import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createDatabase } from "../src/agents-db.js";
import { createChatDatabase } from "../src/chat-db.js";
import { runAgentChat } from "../src/run-agent-chat.js";

describe("run-agent-chat", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof createDatabase>;
  let chatDb: ReturnType<typeof createChatDatabase>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = createDatabase(sqlite);
    chatDb = createChatDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  it("auto-creates a chat and persists user/assistant messages", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chatResponse = vi.fn().mockResolvedValue({
      content: "Hi there!",
      thinkingContent: "",
      promptTokens: 10,
      completionTokens: 5,
      reasoningTokens: 0,
    });

    const output = await runAgentChat({
      agent,
      prompt: "Hello there",
      chatDb,
      chatResponse,
    });

    expect(typeof output.chatId).toBe("string");
    expect(typeof output.userMessageId).toBe("string");

    const chatResult = chatDb.getChat(output.chatId!);
    expect(chatResult).toBeDefined();
    expect(chatResult!.chat.title).toBe("Hello there");
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[0].content).toBe("Hello there");
    expect(chatResult!.messages[1].role).toBe("assistant");
    expect(chatResult!.messages[1].content).toBe("Hi there!");
  });

  it("reuses existing chat history when chatId is provided", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Existing" });

    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "What is 2+2?", modelUsed: agent.model });
    chatDb.insertMessage({ chatId: chat.id, role: "assistant", content: "4", modelUsed: agent.model });

    const chatResponse = vi.fn().mockResolvedValue({
      content: "6",
      thinkingContent: "",
      promptTokens: 8,
      completionTokens: 4,
      reasoningTokens: 0,
    });

    await runAgentChat({
      agent,
      prompt: "What is 3+3?",
      chatId: chat.id,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
        ],
        prompt: "What is 3+3?",
      }),
    );

    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(4);
    expect(chatResult!.messages[3].content).toBe("6");
    expect(chatResult!.messages[3].promptTokens).toBe(8);
    expect(chatResult!.messages[3].completionTokens).toBe(4);
    expect(chatResult!.messages[3].totalTokens).toBe(12);
  });
});
