import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createChatDatabase } from "../src/chat-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import { createWorkspaceChatsDatabase } from "../src/workspace-chats-db.js";
import { createRequestTracker, type RequestTracker } from "../src/request-tracker.js";
import { handleMessage } from "../src/messageHandler.js";
import Database from "better-sqlite3";

// ── RequestTracker tests ────────────────────────────────────────────────

describe("RequestTracker", () => {
  let tracker: RequestTracker;

  beforeEach(() => {
    tracker = createRequestTracker();
  });

  it("registers and unregisters an active request", () => {
    const abort = vi.fn();
    tracker.register("req-1", { abort });
    expect(tracker.get("req-1")).toEqual({ abort });

    tracker.unregister("req-1");
    expect(tracker.get("req-1")).toBeUndefined();
  });

  it("returns undefined for unknown request ID", () => {
    expect(tracker.get("unknown")).toBeUndefined();
  });

  it("abort calls the registered abort callback and unregisters", () => {
    const abort = vi.fn();
    tracker.register("req-1", { abort });

    tracker.abort("req-1");

    expect(abort).toHaveBeenCalledOnce();
    expect(tracker.get("req-1")).toBeUndefined();
  });

  it("abort is a no-op for unknown request ID", () => {
    expect(() => tracker.abort("unknown")).not.toThrow();
  });

  it("abort is a no-op for already unregistered request", () => {
    const abort = vi.fn();
    tracker.register("req-1", { abort });
    tracker.unregister("req-1");

    tracker.abort("req-1");
    expect(abort).not.toHaveBeenCalled();
  });

  it("supports multiple concurrent requests", () => {
    const abort1 = vi.fn();
    const abort2 = vi.fn();
    tracker.register("req-1", { abort: abort1 });
    tracker.register("req-2", { abort: abort2 });

    tracker.abort("req-1");
    expect(abort1).toHaveBeenCalledOnce();
    expect(abort2).not.toHaveBeenCalled();
    expect(tracker.get("req-1")).toBeUndefined();
    expect(tracker.get("req-2")).toEqual({ abort: abort2 });
  });
});

// ── Abort message handling ──────────────────────────────────────────────

describe("Abort message handling via handleMessage", () => {
  it("invokes onAbort callback when an abort message is received", () => {
    const onAbort = vi.fn();
    handleMessage(JSON.stringify({ type: "abort", id: "req-123" }), {
      onRegistered: vi.fn(),
      onPing: vi.fn(),
      onAbort,
    });

    expect(onAbort).toHaveBeenCalledWith("req-123");
  });

  it("does not invoke onAbort for non-abort messages", () => {
    const onAbort = vi.fn();
    handleMessage(JSON.stringify({ type: "registered", id: "host-1" }), {
      onRegistered: vi.fn(),
      onPing: vi.fn(),
      onAbort,
    });

    expect(onAbort).not.toHaveBeenCalled();
  });
});

// ── Integration: handleRequest with abort ───────────────────────────────

describe("handleRequest with abort", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatDb: ReturnType<typeof createChatDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let wchatDb: ReturnType<typeof createWorkspaceChatsDatabase>;
  let sqliteDb: Database.Database;
  let tracker: RequestTracker;

  /**
   * Creates a mock chatResponse that simulates a long-running agent
   * which resolves with a partial result when the abort signal fires.
   */
  function createChatResponseThatCanAbort() {
    return vi.fn(async (input: any) => {
      return new Promise<{ content: string; promptTokens: number; completionTokens: number; aborted: boolean }>(
        (resolve) => {
          if (input.signal?.aborted) {
            resolve({
              content: "",
              promptTokens: 0,
              completionTokens: 0,
              aborted: true,
            });
            return;
          }
          if (input.signal) {
            input.signal.addEventListener("abort", () => {
              resolve({
                content: "Partial response before abort...",
                promptTokens: 10,
                completionTokens: 5,
                aborted: true,
              });
            }, { once: true });
          }
          // No abort signal — hangs forever (tests that don't abort should not use this mock)
        },
      );
    });
  }

  beforeEach(() => {
    sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatDb = createChatDatabase(sqliteDb);
    wdb = createWorkspacesDatabase(sqliteDb);
    wchatDb = createWorkspaceChatsDatabase(sqliteDb);
    tracker = createRequestTracker();
  });

  it("registers the request in the tracker when send-message starts", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chatResponse = createChatResponseThatCanAbort();

    const sendPromise = handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "req-abort-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    // The request should be registered in the tracker while running
    expect(tracker.get("req-abort-1")).toBeDefined();

    // Clean up: abort to resolve the pending promise
    tracker.abort("req-abort-1");
    await sendPromise;
  });

  it("unregisters the request when send-message completes normally", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chatResponse = vi.fn().mockResolvedValue({
      content: "Hello!",
      promptTokens: 10,
      completionTokens: 5,
    });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "req-complete-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    expect(tracker.get("req-complete-1")).toBeUndefined();
  });

  it("unregisters the request when send-message errors", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chatResponse = vi.fn().mockRejectedValue(new Error("ollama down"));

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "req-error-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    expect(tracker.get("req-error-1")).toBeUndefined();
  });

  it("persists partial response when request is aborted", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Abort test" });
    const chatResponse = createChatResponseThatCanAbort();

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    const sendPromise = handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello", chatId: chat.id },
      id: "req-abort-2",
      send,
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    // Abort the request
    tracker.abort("req-abort-2");

    await sendPromise;

    // Verify the partial response was persisted
    const chatResult = chatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].role).toBe("user");
    expect(chatResult!.messages[0].content).toBe("hello");
    expect(chatResult!.messages[1].role).toBe("assistant");
    expect(chatResult!.messages[1].content).toBe("Partial response before abort...");

    // Verify the response was sent with aborted flag
    const response = result.find((r) => (r as any).type === "response") as any;
    expect(response).toBeDefined();
    expect(response.data.response).toBe("Partial response before abort...");
    expect(response.data.aborted).toBe(true);
  });

  it("unregisters the request after abort completes", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chatResponse = createChatResponseThatCanAbort();

    const sendPromise = handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "req-abort-3",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    tracker.abort("req-abort-3");
    await sendPromise;

    expect(tracker.get("req-abort-3")).toBeUndefined();
  });

  it("aborts workspace message request and persists partial responses", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "qwen3:8b" });
    const workspace = wdb.createWorkspace({ name: "Test WS" });
    wdb.addAgentToWorkspace(workspace.id, agent1.id);
    wdb.addAgentToWorkspace(workspace.id, agent2.id);
    const wchat = wchatDb.createChat({ workspaceId: workspace.id });

    // First agent completes normally, second agent gets aborted
    let callCount = 0;
    const chatResponse = vi.fn(async (input: any) => {
      callCount++;
      if (callCount === 1) {
        return { content: "First agent done", promptTokens: 10, completionTokens: 5 };
      }
      // Second agent — can be aborted
      return new Promise<{ content: string; promptTokens: number; completionTokens: number; aborted: boolean }>(
        (resolve) => {
          if (input.signal?.aborted) {
            resolve({ content: "", promptTokens: 0, completionTokens: 0, aborted: true });
            return;
          }
          if (input.signal) {
            input.signal.addEventListener("abort", () => {
              resolve({
                content: "Second agent partial...",
                promptTokens: 8,
                completionTokens: 3,
                aborted: true,
              });
            }, { once: true });
          }
        },
      );
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    const sendPromise = handleRequest({
      action: "send-workspace-message",
      payload: {
        workspaceChatId: wchat.id,
        prompt: "hello",
        agentIds: [agent1.id, agent2.id],
      },
      id: "req-ws-abort-1",
      send,
      db,
      wdb,
      wchatDb,
      chatResponse,
      tracker,
    });

    // Wait for the second agent to start (first agent completes immediately)
    await vi.waitFor(() => expect(callCount).toBe(2));

    // Abort while second agent is running
    tracker.abort("req-ws-abort-1");
    await sendPromise;

    // Verify partial responses persisted
    const chatResult = wchatDb.getChat(wchat.id);
    const messages = chatResult!.messages;
    // user message + agent1 complete + agent2 partial
    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages[0].senderType).toBe("user");
    expect(messages[1].senderType).toBe("agent");
    expect(messages[1].content).toBe("First agent done");
    expect(messages[2].senderType).toBe("agent");
    expect(messages[2].content).toBe("Second agent partial...");

    // Verify response sent with aborted flag
    const response = result.find((r) => (r as any).type === "response") as any;
    expect(response).toBeDefined();
    expect(response.data.aborted).toBe(true);
  });

  it("does not register tracker for non-streaming actions", () => {
    const chatResponse = vi.fn();

    handleRequest({
      action: "list-agents",
      payload: {},
      id: "req-list-1",
      send: () => {},
      db,
      chatResponse,
      tracker,
    });

    expect(tracker.get("req-list-1")).toBeUndefined();
  });

  it("passes abort signal to chatResponse", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    const chatResponse = vi.fn().mockResolvedValue({
      content: "Hello!",
      promptTokens: 10,
      completionTokens: 5,
    });

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "req-signal-1",
      send: () => {},
      db,
      chatDb,
      chatResponse,
      tracker,
    });

    // Verify chatResponse was called with a signal
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
