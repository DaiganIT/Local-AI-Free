/**
 * Integration test: verifies the full agent pipeline
 * (Ollama provider → Agent class → runAgent result)
 * by mocking only the global fetch.
 *
 * No module mocking — uses the real Agent and ollama provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers: NDJSON streaming body
// ---------------------------------------------------------------------------

const MOCK_BASE = "http://mock-ollama:11434";

function makeOllamaStream(chunks: Record<string, unknown>[]): ReadableStream {
  const encoder = new TextEncoder();
  const body = chunks.map((c) => JSON.stringify(c)).join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

function textChunk(text: string): Record<string, unknown> {
  return {
    model: "test-model",
    created_at: "2024-01-01T00:00:00Z",
    message: { role: "assistant", content: text },
    done: false,
  };
}

function thinkingChunk(thinking: string): Record<string, unknown> {
  return {
    model: "test-model",
    created_at: "2024-01-01T00:00:00Z",
    message: { role: "assistant", content: "", thinking },
    done: false,
  };
}

function doneChunk(evalCount: number, promptEvalCount: number, reason = "stop"): Record<string, unknown> {
  return {
    model: "test-model",
    created_at: "2024-01-01T00:00:00Z",
    message: { role: "assistant", content: "" },
    done: true,
    done_reason: reason,
    eval_count: evalCount,
    prompt_eval_count: promptEvalCount,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agent-runner integration (real Agent + mocked fetch)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Clear module cache so each test gets a fresh runAgent with clean ollama registration
    vi.resetModules();
  });

  it("streams a text response and returns content + token stats", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOllamaStream([
        textChunk("Hel"),
        textChunk("lo!"),
        doneChunk(15, 8),
      ]),
    } as Response);

    const { runAgent } = await import("../src/agent-runner.js");

    const result = await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "You are helpful.",
      prompt: "Say hello!",
      messages: [],
      provider: "ollama",
    });

    expect(result.content).toBe("Hello!");
    expect(result.promptTokens).toBe(8);
    expect(result.completionTokens).toBe(15);
  });

  it("passes the full conversation history to Ollama", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOllamaStream([
        textChunk("OK"),
        doneChunk(1, 1),
      ]),
    } as Response);

    const { runAgent } = await import("../src/agent-runner.js");

    await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "System prompt",
      prompt: "Third turn",
      messages: [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question" },
      ],
      provider: "ollama",
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsedBody = JSON.parse(fetchCall[1].body as string);

    expect(parsedBody.model).toBe("test-model");
    expect(parsedBody.messages).toEqual([
      { role: "system", content: "System prompt" },
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second question" },
      { role: "user", content: "Third turn" },
    ]);
    expect(parsedBody.stream).toBe(true);
  });

  it("filters thinking blocks from returned content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOllamaStream([
        thinkingChunk("Let me "),
        thinkingChunk("reason..."),
        textChunk("42."),
        doneChunk(20, 5),
      ]),
    } as Response);

    const { runAgent } = await import("../src/agent-runner.js");

    const result = await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "You are helpful.",
      prompt: "What is 6*7?",
      messages: [],
      provider: "ollama",
    });

    // Should only contain text, not thinking
    expect(result.content).toBe("42.");
    // But token stats still include thinking tokens (OLLAMA limitation)
    expect(result.promptTokens).toBe(5);
    expect(result.completionTokens).toBe(20);
  });

  it("handles HTTP error by returning empty content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    } as Response);

    const { runAgent } = await import("../src/agent-runner.js");

    const result = await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "System",
      prompt: "Fail please",
      messages: [],
      provider: "ollama",
    });

    // Agent stores error in state but returns empty result
    expect(result.content).toBe("");
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
  });

  it("handles network error by returning empty content", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { runAgent } = await import("../src/agent-runner.js");

    const result = await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "System",
      prompt: "Network error",
      messages: [],
      provider: "ollama",
    });

    expect(result.content).toBe("");
    expect(result.completionTokens).toBe(0);
  });

  it("includes the system message in the Ollama request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeOllamaStream([
        textChunk("Sure!"),
        doneChunk(10, 20),
      ]),
    } as Response);

    const { runAgent } = await import("../src/agent-runner.js");

    await runAgent({
      modelId: "test-model",
      baseUrl: MOCK_BASE,
      systemPrompt: "You are a pirate assistant.",
      prompt: "Hello",
      messages: [],
      provider: "ollama",
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsedBody = JSON.parse(fetchCall[1].body as string);

    // System prompt should be the first message
    expect(parsedBody.messages[0].role).toBe("system");
    expect(parsedBody.messages[0].content).toBe("You are a pirate assistant.");
  });
});
