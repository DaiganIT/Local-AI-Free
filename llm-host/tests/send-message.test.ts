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
import { readConfinedFileBase64 } from "../src/handlers/file-confinement.js";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
    statSync: vi.fn(() => ({ isFile: () => true })),
  };
});

vi.mock("../src/handlers/file-confinement.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/handlers/file-confinement.js")>();
  return {
    ...actual,
    readConfinedFileBase64: vi.fn(),
  };
});

describe("send-message", () => {
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
    vi.mocked(readConfinedFileBase64).mockClear();
  });

  it("returns error when send-message is called with a non-existent agent", async () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: "non-existent", prompt: "hello" },
      id: "6",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("agent not found: non-existent");
  });
  it("calls chatResponse with buildSystemPrompt output (no AGENTS.md on disk)", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hello back!", promptTokens: 10, completionTokens: 5 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "7",
      send,
      db,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "llama3.2",
        systemPrompt: expect.stringContaining("You are a helpful assistant."),
        prompt: "hello",
        messages: [],
      }),
    );
    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).response).toBe("Hello back!");
  });
  it("passes toolNames from agent DB to chatResponse", async () => {
    const agent = db.createAgent({ name: "tooled-agent", model: "llama3.2", tools: ["read", "bash", "edit"] });
    chatResponse.mockResolvedValue({ content: "Done!", promptTokens: 5, completionTokens: 3 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "read a file" },
      id: "tools-wire",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        toolNames: ["read", "bash", "edit"],
      }),
    );
  });
  it("passes undefined toolNames when agent has no tools", async () => {
    const agent = db.createAgent({ name: "no-tools-agent", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Done!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "no-tools-wire",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        toolNames: undefined,
      }),
    );
  });
  it("sends full conversation history from chatDb when resuming a chat", async () => {
    const agent = db.createAgent({
      name: "test-agent",
      model: "llama3.2",
    });
    const chat = chatDb.createChat({ agentId: agent.id });

    // Simulate an existing conversation
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "What is 2+2?", modelUsed: agent.model });
    chatDb.insertMessage({ chatId: chat.id, role: "assistant", content: "4", modelUsed: agent.model });

    chatResponse.mockResolvedValue({ content: "Five." });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "What about 3+3?", chatId: chat.id },
      id: "conv-1",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "llama3.2",
        systemPrompt: expect.stringContaining("You are a helpful assistant."),
        prompt: "What about 3+3?",
        messages: [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
        ],
      }),
    );

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).response).toBe("Five.");
  });
  it("returns error when send-message payload is missing prompt", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id },
      id: "8",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: prompt");
  });
  it("returns error when chatResponse throws", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    chatResponse.mockRejectedValue(new Error("ollama down"));

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "9",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("ollama down");
  });
  it("writes last-error.md to agent folder when send-message errors", async () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    chatResponse.mockRejectedValue(new Error("CHECK constraint failed: length(content) > 0"));
    const basePath = "/tmp/test-agents";

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "update instructions" },
      id: "err-log-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(basePath, ".agents", "pa-1", "last-error.md"),
      expect.stringContaining("CHECK constraint failed"),
      "utf-8",
    );
    const written = vi.mocked(writeFileSync).mock.calls.find(
      c => (c[0] as string).includes("last-error.md"),
    );
    expect(written).toBeDefined();
    const content = written![1] as string;
    expect(content).toContain("# Last Error: PA 1");
    expect(content).toContain("llama3.2");
    expect(content).toContain("update instructions");
    expect(content).toContain("CHECK constraint failed: length(content) > 0");
  });
  it("does not write last-error.md when agentFolderBasePath is not set", async () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    chatResponse.mockRejectedValue(new Error("ollama down"));

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "err-log-2",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    const errorCalls = vi.mocked(writeFileSync).mock.calls.filter(
      c => (c[0] as string).includes("last-error.md"),
    );
    expect(errorCalls).toHaveLength(0);
  });
  it("persists messages when send-message includes chatId", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Test" });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hello", chatId: chat.id },
      id: "14",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ response: "Hi!" });
    expect(response.data).toMatchObject({ agentId: agent.id, chatId: chat.id });

    // Verify persistence
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[1].role).toBe("assistant");
  });
  it("auto-creates a chat when send-message is called without chatId", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hello there" },
      id: "17",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ response: "Hi!" });
    expect(typeof response.data.chatId).toBe("string");

    const chatId = response.data.chatId as string;
    const chatResult = chatDb.getChat(chatId);
    expect(chatResult).toBeDefined();
    expect(chatResult!.chat.title).toBe("Hello there");
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[1].role).toBe("assistant");
  });
  it("does NOT auto-create a chat when chatDb is not available and no chatId is provided", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hello" },
      id: "18",
      send,
      db,
      chatDb: undefined,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ response: "Hi!" });
    expect(response.data.chatId).toBeNull();
  });
  it("persists token counts from Ollama response on send-message", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Token test" });
    chatResponse.mockResolvedValue({
      content: "The answer is 4",
      completionTokens: 8,
      promptTokens: 42,
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "What is 2+2?", chatId: chat.id },
      id: "tokens-1",
      send,
      db,
      chatDb,
      chatResponse,
    });

    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);

    const assistantMsg = chatResult!.messages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.promptTokens).toBe(42);
    expect(assistantMsg.completionTokens).toBe(8);
    expect(assistantMsg.totalTokens).toBe(50);

    expect(chatResult!.chat.totalPromptTokens).toBe(42);
    expect(chatResult!.chat.totalCompletionTokens).toBe(8);
    expect(chatResult!.chat.totalTokens).toBe(50);
  });
  it("handles send-message when Ollama returns no token counts", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "No tokens" });
    chatResponse.mockResolvedValue({ content: "Hello" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi", chatId: chat.id },
      id: "tokens-2",
      send,
      db,
      chatDb,
      chatResponse,
    });

    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);

    const assistantMsg = chatResult!.messages[1];
    expect(assistantMsg.promptTokens).toBeNull();
    expect(assistantMsg.completionTokens).toBeNull();
    expect(assistantMsg.totalTokens).toBeNull();
    expect(chatResult!.chat.totalTokens).toBe(0);
  });
  it("writes last-run.md to agent folder on send-message", async () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hello!", promptTokens: 10, completionTokens: 5 });
    const basePath = "/tmp/test-agents";

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi there" },
      id: "log-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(basePath, ".agents", "pa-1", "last-run.md"),
      expect.stringContaining("Hi there"),
      "utf-8",
    );
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain("# Last Run: PA 1");
    expect(written).toContain("llama3.2");
    expect(written).toContain("10 in / 5 out");
    expect(written).toContain("Hello!");
  });
  it("does not write last-run.md when agentFolderBasePath is not set", async () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hello!", promptTokens: 10, completionTokens: 5 });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi there" },
      id: "log-2",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    expect(writeFileSync).not.toHaveBeenCalled();
  });
  it("returns error when assistant content is empty (DB constraint)", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Tool call test" });
    // Simulate a tool-calling scenario where the final text content is empty
    chatResponse.mockResolvedValue({ content: "", promptTokens: 10, completionTokens: 5 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "update your instructions", chatId: chat.id },
      id: "empty-content",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    // Currently returns the DB constraint error — this is the known bug
    expect(response.error).toContain("CHECK constraint failed");
  });
  it("reads AGENTS.md for system prompt when sending a message", async () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents";
    vi.mocked(readFileSync).mockReturnValue("You are a pirate.");
    chatResponse.mockResolvedValue({ content: "Arrr!", promptTokens: 5, completionTokens: 3 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "instr-msg",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("You are a pirate."),
      }),
    );
  });
  it("builds conversation history with all agent msgs mapped to assistant", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    // Pre-populate with some messages
    wchatDb.addMessage({
      workspaceChatId: chat.id,
      senderType: "user",
      senderId: null,
      content: "First question",
      modelUsed: "",
    });
    wchatDb.addMessage({
      workspaceChatId: chat.id,
      senderType: "agent",
      senderId: "other-agent",
      content: "First answer",
      modelUsed: "mistral",
    });

    chatResponse.mockResolvedValue({ content: "Second answer", promptTokens: 20, completionTokens: 10 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Second question", agentIds: [agent.id] },
      id: "wsm-7",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // Verify chatResponse was called with the full workspace chat history
    // All agent messages should be mapped to 'assistant' role
    // Plus the user message added to in-memory history
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "First question" },
          { role: "assistant", content: "First answer" },
          { role: "user", content: "Second question" },
        ],
        prompt: "Second question",
        modelId: "llama3.2",
      }),
    );
  });
  it("passes agent tools and system prompt to chatResponse", async () => {
    const agent = db.createAgent({ name: "Coder", model: "llama3.2", tools: ["read", "bash"] });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    const basePath = "/tmp/test-agents";
    vi.mocked(readFileSync).mockReturnValue("You are a coding assistant.");
    chatResponse.mockResolvedValue({ content: "Code!", promptTokens: 5, completionTokens: 3 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Write code", agentIds: [agent.id] },
      id: "wsm-8",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
      agentFolderBasePath: basePath,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("You are a coding assistant."),
        toolNames: ["read", "bash"],
        agentAlias: "coder",
        agentFolderBasePath: basePath,
      }),
    );
  });
  it("returns error when chatResponse throws (single agent)", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockRejectedValue(new Error("ollama down"));

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent.id] },
      id: "wsm-10",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // Filter for the final response message (streaming adds workspace_agent_start/end)
    const responseMessages = result.filter((m) => (m as any).type === "response");
    expect(responseMessages.length).toBe(1);
    const response = responseMessages[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      responses: [],
      errors: [{ agentId: agent.id, message: "ollama down" }],
      workspaceChatId: chat.id,
    });
  });
  it("each agent sees only the user message in parallel, not other agents' responses", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "Agent 1 says hi", promptTokens: 10, completionTokens: 5 })
      .mockResolvedValueOnce({ content: "Agent 2 builds on that", promptTokens: 20, completionTokens: 10 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Discuss", agentIds: [agent1.id, agent2.id] },
      id: "wsm-multi-2",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // Both agents see only [user prompt] — no other agents' responses
    for (let i = 1; i <= 2; i++) {
      expect(chatResponse).toHaveBeenNthCalledWith(i, expect.objectContaining({
        messages: [{ role: "user", content: "Discuss" }],
        prompt: "Discuss",
      }));
    }
  });
  it("persists token counts for each agent in multi-agent run", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "A1", promptTokens: 100, completionTokens: 50 })
      .mockResolvedValueOnce({ content: "A2", promptTokens: 200, completionTokens: 75 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent1.id, agent2.id] },
      id: "wsm-multi-5",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(3);

    // Agent 1 message
    expect(chatResult!.messages[1].promptTokens).toBe(100);
    expect(chatResult!.messages[1].completionTokens).toBe(50);
    expect(chatResult!.messages[1].totalTokens).toBe(150);

    // Agent 2 message
    expect(chatResult!.messages[2].promptTokens).toBe(200);
    expect(chatResult!.messages[2].completionTokens).toBe(75);
    expect(chatResult!.messages[2].totalTokens).toBe(275);

    // Chat totals
    expect(chatResult!.chat.totalPromptTokens).toBe(300);
    expect(chatResult!.chat.totalCompletionTokens).toBe(125);
    expect(chatResult!.chat.totalTokens).toBe(425);
  });
  it("emits stream messages via send() during send-message when chatResponse triggers onEvent", async () => {
    const agent = db.createAgent({ name: "Stream Agent", model: "llama3.2" });

    // Simulate chatResponse that triggers onEvent callbacks
    const streamingChatResponse = vi.fn().mockImplementation(async (input: any) => {
      if (input.onEvent) {
        input.onEvent({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
        });
        input.onEvent({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_delta", delta: "Hmm", contentIndex: 0 },
        });
      }
      return { content: "Hello world!", promptTokens: 10, completionTokens: 5 };
    });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi" },
      id: "stream-1",
      send,
      db,
      chatDb,
      chatResponse: streamingChatResponse,
    });

    const streamMessages = sent.filter(
      (m) => (m as any).type === "stream",
    );
    const responseMessages = sent.filter(
      (m) => (m as any).type === "response",
    );

    expect(streamMessages.length).toBe(2);
    expect(streamMessages[0]).toMatchObject({
      type: "stream",
      id: "stream-1",
      event: {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello" },
      },
    });
    expect(streamMessages[1]).toMatchObject({
      type: "stream",
      id: "stream-1",
      event: {
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "Hmm" },
      },
    });

    expect(responseMessages.length).toBe(1);
    expect(responseMessages[0]).toMatchObject({
      type: "response",
      id: "stream-1",
      data: expect.objectContaining({ response: "Hello world!" }),
    });
  });
  it("does not emit stream messages when chatResponse does not call onEvent", async () => {
    const agent = db.createAgent({ name: "No Stream Agent", model: "llama3.2" });

    const nonStreamingChatResponse = vi.fn().mockResolvedValue({
      content: "Direct answer",
      promptTokens: 5,
      completionTokens: 3,
    });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi" },
      id: "no-stream-1",
      send,
      db,
      chatDb,
      chatResponse: nonStreamingChatResponse,
    });

    const streamMessages = sent.filter(
      (m) => (m as any).type === "stream",
    );
    const responseMessages = sent.filter(
      (m) => (m as any).type === "response",
    );

    expect(streamMessages.length).toBe(0);
    expect(responseMessages.length).toBe(1);
    expect(responseMessages[0]).toMatchObject({
      type: "response",
      id: "no-stream-1",
      data: expect.objectContaining({ response: "Direct answer" }),
    });
  });
  it("final response is still sent even after stream events, and messages persisted", async () => {
    const agent = db.createAgent({ name: "Stream Agent 2", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id });

    const streamingChatResponse = vi.fn().mockImplementation(async (input: any) => {
      if (input.onEvent) {
        input.onEvent({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Partial", contentIndex: 0 },
        });
      }
      return { content: "Full response", promptTokens: 10, completionTokens: 5 };
    });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Tell me", chatId: chat.id },
      id: "stream-final",
      send,
      db,
      chatDb,
      chatResponse: streamingChatResponse,
    });

    const responseMessages = sent.filter(
      (m) => (m as any).type === "response",
    );
    expect(responseMessages).toHaveLength(1);
    expect(responseMessages[0]).toMatchObject({
      type: "response",
      id: "stream-final",
      data: expect.objectContaining({
        response: "Full response",
        chatId: chat.id,
      }),
    });

    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[1].role).toBe("assistant");
    expect(chatResult!.messages[1].content).toBe("Full response");
  });
  it("passes onEvent callback to chatResponse that emits stream messages via send", async () => {
    const agent = db.createAgent({ name: "Stream Agent 3", model: "llama3.2" });

    const streamingChatResponse = vi.fn().mockImplementation(async (input: any) => {
      expect(typeof input.onEvent).toBe("function");
      return { content: "Done", promptTokens: 5, completionTokens: 3 };
    });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hi" },
      id: "stream-verify",
      send: () => {},
      db,
      chatDb,
      chatResponse: streamingChatResponse,
    });

    expect(streamingChatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        onEvent: expect.any(Function),
      }),
    );
  });
  it("persists attachments on user message when send-message includes them", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Attachment test" });
    chatResponse.mockResolvedValue({ content: "I see the file!" });

    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
    ];

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Check this file", chatId: chat.id, attachments },
      id: "attach-1",
      send,
      db,
      chatDb,
      chatResponse,
    });

    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[0].attachments).toEqual(attachments);
    // Assistant message should have no attachments
    expect(chatResult!.messages[1].attachments).toBeNull();
  });
  it("persists attachments on user message in workspace chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "I see the file!", promptTokens: 5, completionTokens: 3 });

    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
    ];

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Check this file", agentIds: [agent.id], attachments },
      id: "ws-attach-1",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].senderType).toBe("user");
    expect(chatResult!.messages[0].attachments).toEqual(attachments);
    // Agent message should have no attachments
    expect(chatResult!.messages[1].attachments).toBeNull();
  });
  it("appends attachment hints to prompt passed to chatResponse (agent chat)", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Attachment prompt" });
    chatResponse.mockResolvedValue({ content: "I read the file!" });

    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
    ];

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Check this file", chatId: chat.id, attachments },
      id: "attach-prompt-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    // chatResponse should receive the prompt with attachment hint appended
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Check this file\n\n[Attached: report.pdf (report.pdf)]",
      }),
    );

    // Persisted user message should have the ORIGINAL prompt (no hint)
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages[0].content).toBe("Check this file");
  });

  it("appends attachment hints to prompt in workspace chat", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "I read the file!", promptTokens: 5, completionTokens: 3 });

    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
      { name: "data.csv", path: "uploads/data.csv", size: 2048 },
    ];

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Check these files", agentIds: [agent.id], attachments },
      id: "ws-attach-prompt-1",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // chatResponse should receive the prompt with attachment hints appended
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Check these files\n\n[Attached: report.pdf (report.pdf)]\n[Attached: data.csv (data.csv)]",
      }),
    );

    // Persisted user message should have the ORIGINAL prompt (no hint)
    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages[0].content).toBe("Check these files");
  });

  it("includes attachment hints from previous messages in conversation history (agent chat)", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id });

    // First message with an attachment
    chatResponse.mockResolvedValueOnce({ content: "I read it!", promptTokens: 5, completionTokens: 3 });
    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, chatId: chat.id, prompt: "Check this", attachments: [{ name: "report.pdf", path: "uploads/report.pdf", size: 1024 }] },
      id: "hist-1",
      send: () => {},
      db, chatDb, chatResponse,
    });

    // Second message — no new attachment, but history should include the hint from the first
    chatResponse.mockResolvedValueOnce({ content: "Still have the file!", promptTokens: 5, completionTokens: 3 });
    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, chatId: chat.id, prompt: "What was in that file again?" },
      id: "hist-2",
      send: () => {},
      db, chatDb, chatResponse,
    });

    // The second chatResponse call should have history with the attachment hint
    const secondCall = chatResponse.mock.calls[1]![0] as any;
    const userHistoryMsg = secondCall.messages.find((m: any) => m.role === "user" && m.content.includes("report.pdf"));
    expect(userHistoryMsg).toBeDefined();
    expect(userHistoryMsg.content).toContain("[Attached: report.pdf (report.pdf)]");
  });

  it("includes attachment hints from previous messages in workspace chat history", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    // First message with attachment
    chatResponse.mockResolvedValueOnce({ content: "Got it!", promptTokens: 5, completionTokens: 3 });
    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Check this", agentIds: [agent.id], attachments: [{ name: "data.csv", path: "uploads/data.csv", size: 2048 }] },
      id: "ws-hist-1",
      send: () => {},
      db, chatResponse, wdb, wchatDb,
    });

    // Second message — should see attachment hint in history
    chatResponse.mockResolvedValueOnce({ content: "Still have it!", promptTokens: 5, completionTokens: 3 });
    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "What was in the CSV?", agentIds: [agent.id] },
      id: "ws-hist-2",
      send: () => {},
      db, chatResponse, wdb, wchatDb,
    });

    const secondCall = chatResponse.mock.calls[1]![0] as any;
    const userHistoryMsg = secondCall.messages.find((m: any) => m.role === "user" && m.content.includes("data.csv"));
    expect(userHistoryMsg).toBeDefined();
    expect(userHistoryMsg.content).toContain("[Attached: data.csv (data.csv)]");
  });

  it("does not modify prompt when no attachments are present", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Hello" },
      id: "no-attach-prompt",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello",
      }),
    );
  });

  it("passes images to chatResponse when image attachments are present (agent chat)", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Image test" });
    chatResponse.mockResolvedValue({ content: "I see the image!" });
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "iVBORw0KGgo=",
      mimeType: "image/png",
      path: "photo.png",
    });

    const attachments = [
      { name: "photo.png", path: "uploads/photo.png", size: 2048, mimeType: "image/png" },
    ];

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "What is this?", chatId: chat.id, attachments },
      id: "img-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      agentFolderBasePath: "/data/agents",
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
        ],
      }),
    );
  });

  it("does not pass images when attachments are not images", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Got the CSV!" });

    const attachments = [
      { name: "data.csv", path: "uploads/data.csv", size: 2048, mimeType: "text/csv" },
    ];

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "Read this", attachments },
      id: "no-img-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        images: undefined,
      }),
    );
  });

  it("does not pass PDFs as images in workspace chat — PDFs are not supported by Ollama's images field", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "I see it!", promptTokens: 5, completionTokens: 3 });

    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 4096, mimeType: "application/pdf" },
    ];

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "What is this PDF?", agentIds: [agent.id], attachments },
      id: "ws-img-1",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
      agentFolderBasePath: "/data/agents",
    });

    // PDFs should NOT be sent as images — they are handled by read_attachment tool
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        images: undefined,
      }),
    );
  });

  it("emits streaming deltas with agentId between wrapper events", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const streamingChatResponse = vi.fn()
      .mockImplementationOnce(async (input: any) => {
        if (input.onEvent) {
          input.onEvent({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
          });
        }
        return { content: "Hello world!", promptTokens: 10, completionTokens: 5 };
      })
      .mockImplementationOnce(async (input: any) => {
        if (input.onEvent) {
          input.onEvent({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "Goodbye", contentIndex: 0 },
          });
        }
        return { content: "Goodbye world!", promptTokens: 20, completionTokens: 10 };
      });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent1.id, agent2.id] },
      id: "ws-stream-2",
      send,
      db,
      chatResponse: streamingChatResponse,
      wdb,
      wchatDb,
    });

    const streamMessages = sent.filter((m) => (m as any).type === "stream");
    const eventTypes = streamMessages.map((m) => (m as any).event.type);

    // With parallel execution: verify all expected events are present
    expect(eventTypes).toContain("workspace_agent_start");
    expect(eventTypes).toContain("message_update");
    expect(eventTypes).toContain("workspace_agent_end");
    // Each event type should appear twice (once per agent)
    const starts = eventTypes.filter(t => t === "workspace_agent_start");
    const ends = eventTypes.filter(t => t === "workspace_agent_end");
    const updates = eventTypes.filter(t => t === "message_update");
    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);
    expect(updates).toHaveLength(2);

    // Verify agentId is on the delta events (order may vary with parallel execution)
    const deltas = streamMessages.filter((m) => (m as any).event.type === "message_update");
    const deltaAgentIds = deltas.map((m) => (m as any).event.agentId);
    expect(deltaAgentIds).toContain(agent1.id);
    expect(deltaAgentIds).toContain(agent2.id);
  });
});
