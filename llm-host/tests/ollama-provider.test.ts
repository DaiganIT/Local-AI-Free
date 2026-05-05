import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as piAi from "@mariozechner/pi-ai";
import {
  streamSimpleOllama,
  streamOllama,
  registerOllamaApi,
  createOllamaModel,
  buildOllamaMessages,
} from "../src/providers/ollama.js";

const MOCK_OLLAMA_HOST = "http://mock-ollama:11434";

// ---------------------------------------------------------------------------
// Helper: encode NDJSON chunks into a mock streaming response
// ---------------------------------------------------------------------------

function makeReadableStream(chunks: unknown[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
      }
      controller.close();
    },
  });
}

function mockFetchTextResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: makeReadableStream([body]),
    text: () => Promise.resolve(body),
  };
}

// ---------------------------------------------------------------------------
// Mock model used in all tests
// ---------------------------------------------------------------------------

function mockModel(id = "test-model") {
  return {
    id,
    name: id,
    api: "ollama",
    provider: "ollama",
    baseUrl: MOCK_OLLAMA_HOST,
    reasoning: true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 0,
    maxTokens: 32000,
  };
}

function mockContext(messages: { role: string; content: string }[] = []) {
  return {
    systemPrompt: "You are helpful.",
    messages: messages.map((m) => ({
      role: m.role as "user" | "assistant" | "toolResult",
      content: m.content,
      timestamp: Date.now(),
    })),
  };
}

// ---------------------------------------------------------------------------
// streamSimpleOllama
// ---------------------------------------------------------------------------

describe("streamSimpleOllama", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.OLLAMA_HOST;
  });

  it("streams text and emits done with usage", async () => {
    const body = {
      body: makeReadableStream([
        { message: { role: "assistant", content: "Hel" }, done: false },
        { message: { role: "assistant", content: "lo!" }, done: false },
        {
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
          eval_count: 10,
          prompt_eval_count: 5,
        },
      ]),
      ok: true,
      status: 200,
    };

    global.fetch = vi.fn().mockResolvedValue(body);

    const model = mockModel();
    const ctx = mockContext([{ role: "user", content: "say hello" }]);
    const stream = streamSimpleOllama(model, ctx);

    const events: string[] = [];
    const deltas: string[] = [];
    for await (const event of stream) {
      events.push(event.type);
      if (event.type === "text_delta") {
        deltas.push(event.delta);
      }
    }

    expect(deltas).toEqual(["Hel", "lo!"]);
    expect(events).toContain("text_start");
    expect(events).toContain("text_delta");
    expect(events).toContain("done");

    const result = await stream.result();
    expect(result.stopReason).toBe("stop");
    expect(result.usage.input).toBe(5);
    expect(result.usage.output).toBe(10);
    expect(result.usage.totalTokens).toBe(15);

    // Verify fetch was called with correct body
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`${MOCK_OLLAMA_HOST}/api/chat`);
    const reqBody = JSON.parse((opts as { body: string }).body);
    expect(reqBody.model).toBe("test-model");
    expect(reqBody.messages[0].role).toBe("system");
    expect(reqBody.messages[1].role).toBe("user");
    expect(reqBody.stream).toBe(true);
  });

  it("emits thinking events for thinking blocks", async () => {
    const body = {
      body: makeReadableStream([
        {
          message: { role: "assistant", content: "", thinking: "Let me " },
          done: false,
        },
        {
          message: { role: "assistant", content: "", thinking: "think." },
          done: false,
        },
        { message: { role: "assistant", content: "Hi" }, done: false },
        { message: { role: "assistant", content: "!" }, done: false },
        {
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
          eval_count: 20,
          prompt_eval_count: 8,
        },
      ]),
      ok: true,
    };

    global.fetch = vi.fn().mockResolvedValue(body);

    const stream = streamSimpleOllama(mockModel(), mockContext());
    const events: string[] = [];
    for await (const event of stream) {
      events.push(event.type);
    }

    expect(events).toContain("thinking_start");
    expect(events.filter((e) => e === "thinking_delta").length).toBe(2);
    expect(events).toContain("text_start");
    expect(events).toContain("done");

    const result = await stream.result();
    const thinkingBlock = result.content.find((b) => b.type === "thinking");
    expect(thinkingBlock).toBeDefined();
    expect((thinkingBlock! as { thinking: string }).thinking).toBe(
      "Let me think.",
    );
    const textBlock = result.content.find((b) => b.type === "text");
    expect((textBlock! as { text: string }).text).toBe("Hi!");
  });

  it("emits tool call events", async () => {
    const body = {
      body: makeReadableStream([
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "tc_123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: JSON.stringify({ city: "London" }),
                },
              },
            ],
          },
          done: false,
        },
        {
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "tool_calls",
          eval_count: 30,
          prompt_eval_count: 10,
        },
      ]),
      ok: true,
    };

    global.fetch = vi.fn().mockResolvedValue(body);

    const stream = streamSimpleOllama(mockModel(), mockContext());
    const events: string[] = [];
    for await (const event of stream) {
      events.push(event.type);
    }

    expect(events).toContain("toolcall_start");
    expect(events).toContain("toolcall_end");

    const result = await stream.result();
    expect(result.stopReason).toBe("toolUse");
    const toolBlock = result.content.find((b) => b.type === "toolCall");
    expect(toolBlock).toBeDefined();
    expect(toolBlock?.type).toBe("toolCall");
    if (toolBlock?.type === "toolCall") {
      expect(toolBlock.name).toBe("get_weather");
      expect(toolBlock.arguments).toEqual({ city: "London" });
    }
  });

  it("handles non-streamable error responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("model not found"),
      body: null,
    });

    const stream = streamSimpleOllama(mockModel(), mockContext());
    const result = await stream.result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("404");
  });

  it("handles missing body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    });

    const stream = streamSimpleOllama(mockModel(), mockContext());
    const result = await stream.result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("no body");
  });

  it("handles stream closing without done marker", async () => {
    const body = {
      body: makeReadableStream([
        { message: { role: "assistant", content: "Hello" }, done: false },
      ]),
      ok: true,
    };

    global.fetch = vi.fn().mockResolvedValue(body);

    const stream = streamSimpleOllama(mockModel(), mockContext());
    const result = await stream.result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("done marker");
  });
});

// ---------------------------------------------------------------------------
// streamOllama — not implemented
// ---------------------------------------------------------------------------

describe("streamOllama", () => {
  it("throws not implemented error", () => {
    expect(() =>
      streamOllama(mockModel(), mockContext()),
    ).toThrow("not implemented");
  });
});

// ---------------------------------------------------------------------------
// registerOllamaApi
// ---------------------------------------------------------------------------

describe("registerOllamaApi", () => {
  it("registers the ollama api provider", () => {
    // Should not throw
    expect(() => registerOllamaApi()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createOllamaModel
// ---------------------------------------------------------------------------

describe("createOllamaModel", () => {
  it("creates a model with defaults", () => {
    const model = createOllamaModel({ id: "llama3" });

    expect(model.id).toBe("llama3");
    expect(model.api).toBe("ollama");
    expect(model.provider).toBe("ollama");
    expect(model.reasoning).toBe(true);
    expect(model.input).toEqual(["text"]);
    expect(model.contextWindow).toBe(0);
    expect(model.maxTokens).toBe(32000);
    expect(model.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("allows customizing all fields", () => {
    const model = createOllamaModel({
      id: "qwen2.5",
      baseUrl: "http://custom:11434",
      maxTokens: 16000,
      contextWindow: 32768,
      reasoning: false,
    });

    expect(model.id).toBe("qwen2.5");
    expect(model.baseUrl).toBe("http://custom:11434");
    expect(model.maxTokens).toBe(16000);
    expect(model.contextWindow).toBe(32768);
    expect(model.reasoning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildOllamaMessages — image support
// ---------------------------------------------------------------------------

describe("buildOllamaMessages", () => {
  it("includes images array on user messages with ImageContent", () => {
    const ctx: piAi.Context = {
      systemPrompt: "You are helpful.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOllamaMessages(ctx);

    // system + user
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toBe("What is in this image?");
    expect(msgs[1].images).toEqual(["aGVsbG8="]);
  });

  it("includes multiple images in order", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Compare these." },
            { type: "image", data: "img1base64", mimeType: "image/png" },
            { type: "image", data: "img2base64", mimeType: "image/jpeg" },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOllamaMessages(ctx);

    expect(msgs[0].content).toBe("Compare these.");
    expect(msgs[0].images).toEqual(["img1base64", "img2base64"]);
  });

  it("omits images array when no ImageContent in user message", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: "Just text",
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOllamaMessages(ctx);

    expect(msgs[0].images).toBeUndefined();
  });

  it("includes images from toolResult messages", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "toolResult",
          toolCallId: "tc_1",
          toolName: "read_attachment",
          content: [
            { type: "text", text: "File content: screenshot.png" },
            { type: "image", data: "dG9vbF9pbWc=", mimeType: "image/png" },
          ],
          isError: false,
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOllamaMessages(ctx);

    expect(msgs[0].role).toBe("tool");
    expect(msgs[0].content).toBe("File content: screenshot.png");
    expect(msgs[0].images).toEqual(["dG9vbF9pbWc="]);
  });

  it("handles string content user messages (backward compat)", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: "Hello!",
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOllamaMessages(ctx);

    expect(msgs[0].content).toBe("Hello!");
    expect(msgs[0].images).toBeUndefined();
  });
});
