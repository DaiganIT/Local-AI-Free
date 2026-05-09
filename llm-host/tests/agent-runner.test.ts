import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAgent, resolveTools, registerModelFactory, clearModelFactories } from "../src/agent-runner.js";
import type { Agent } from "@mariozechner/pi-agent-core";
import { createOllamaModel } from "../src/providers/ollama.js";
import { createOmlxModel } from "../src/providers/omlx.js";
import { createOpenAIModel } from "../src/providers/openai-models.js";

// Mock pi-agent-core's Agent class and its constructor
const mockSubscribe = vi.fn();
const mockAgent = {
  state: {
    messages: [] as any[],
  },
  prompt: vi.fn().mockResolvedValue(undefined),
  waitForIdle: vi.fn().mockResolvedValue(undefined),
  subscribe: mockSubscribe,
};

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: vi.fn(() => mockAgent),
}));

// Mock pi-coding-agent's individual tool factories
vi.mock("@mariozechner/pi-coding-agent", () => {
  const factories = ["createReadTool", "createBashTool", "createEditTool", "createWriteTool", "createGrepTool", "createFindTool", "createLsTool"];
  const mock: Record<string, any> = {};
  for (const fn of factories) {
    mock[fn] = (name: string) => (cwd: string) => ({ name: name.replace("create", "").replace("Tool", "").toLowerCase(), execute: vi.fn(), cwd });
  }
  // Special cases: createReadTool → read, createBashTool → bash, etc.
  mock.createReadTool = (cwd: string) => ({ name: "read", execute: vi.fn(), cwd });
  mock.createBashTool = (cwd: string) => ({ name: "bash", execute: vi.fn(), cwd });
  mock.createEditTool = (cwd: string) => ({ name: "edit", execute: vi.fn(), cwd });
  mock.createWriteTool = (cwd: string) => ({ name: "write", execute: vi.fn(), cwd });
  mock.createGrepTool = (cwd: string) => ({ name: "grep", execute: vi.fn(), cwd });
  mock.createFindTool = (cwd: string) => ({ name: "find", execute: vi.fn(), cwd });
  mock.createLsTool = (cwd: string) => ({ name: "ls", execute: vi.fn(), cwd });
  return mock;
});

// Mock providers registration (no-op in tests)
vi.mock("../src/providers/ollama.js", () => ({
  registerOllamaApi: vi.fn(),
  createOllamaModel: vi.fn(() => ({
    id: "test-model",
    name: "test-model",
    api: "ollama",
    provider: "ollama",
    baseUrl: "http://localhost:11434",
    reasoning: true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 32000,
  })),
}));

vi.mock("../src/providers/omlx.js", () => ({
  registerOmlxApi: vi.fn(),
  createOmlxModel: vi.fn(() => ({
    id: "test-model",
    name: "test-model",
    api: "omlx",
    provider: "omlx",
    baseUrl: "http://localhost:8000",
    reasoning: true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 32000,
  })),
}));

// Mock openai-models factory
vi.mock("../src/providers/openai-models.js", () => ({
  createOpenAIModel: vi.fn(() => ({
    id: "test-model",
    name: "test-model",
    api: "openai-completions",
    provider: "mlx",
    baseUrl: "http://localhost:11435",
    reasoning: true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 32000,
  })),
}));

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.state.messages = [];
    mockAgent.prompt.mockResolvedValue(undefined);
    mockAgent.waitForIdle.mockResolvedValue(undefined);
    mockSubscribe.mockReset();
  });

  // Helper to push a minimal assistant message so runAgent doesn't throw
  function pushMinimalAssistant() {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
  }

  it("creates an Agent with correct system prompt and model", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are a test assistant.",
      prompt: "Hello!",
      messages: [],
    });

    expect(AgentMock).toHaveBeenCalledWith({
      initialState: expect.objectContaining({
        systemPrompt: "You are a test assistant.",
      }),
    });
  });

  it("passes the user prompt to agent.prompt()", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 2+2?",
      messages: [],
    });

    expect(mockAgent.prompt).toHaveBeenCalledWith("What is 2+2?");
  });

  it("waits for the agent to settle after prompting", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(mockAgent.waitForIdle).toHaveBeenCalled();
  });

  it("rehydrates user messages into the agent state", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Third message",
      messages: [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there!" },
        { role: "user" as const, content: "How are you?" },
      ],
    });

    const messages = mockAgent.state.messages;
    // pushMinimalAssistant() adds 1, then runAgent rehydrates 3
    // Last 3 should be the rehydrated conversation
    const rehydrated = messages.slice(-3);
    expect(rehydrated.length).toBe(3);
    expect(rehydrated[0].role).toBe("user");
    expect(rehydrated[0].content).toBe("Hello");
    expect(rehydrated[1].role).toBe("assistant");
    expect(rehydrated[2].role).toBe("user");
    expect(rehydrated[2].content).toBe("How are you?");
  });

  it("extracts text content from the final assistant response", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "text", text: "The answer is " },
        { type: "text", text: "four." },
      ],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 2+2?",
      messages: [],
    });

    expect(result.content).toBe("The answer is four.");
  });

  it("returns token stats from the response usage", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "Hello!" }],
      usage: { input: 20, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 28, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(result.promptTokens).toBe(20);
    expect(result.completionTokens).toBe(8);
  });

  it("throws when no assistant message is found after the loop", async () => {
    await expect(
      runAgent({
        modelId: "qwen3:8b",
        baseUrl: "http://localhost:11434",
        systemPrompt: "You are helpful.",
        prompt: "Hi",
        messages: [],
      }),
    ).rejects.toThrow("No assistant message found after agent loop");
  });

  it("filters out thinking blocks from the response content", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think about this..." },
        { type: "text", text: "The result is 42." },
      ],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 6*7?",
      messages: [],
    });

    expect(result.content).toBe("The result is 42.");
  });

  it("defaults token counts to 0 when usage is missing", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.reasoningTokens).toBe(0);
  });

  it("calculates reasoningTokens as 0 when there are no thinking blocks", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "The answer is 42." }],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 6*7?",
      messages: [],
    });

    expect(result.reasoningTokens).toBe(0);
    expect(result.completionTokens).toBe(5);
  });

  it("estimates reasoningTokens proportionally from thinking vs text chars", async () => {
    // 100 chars thinking, 50 chars text → thinking is 2/3 of total → 66% of 9 tokens ≈ 6
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "A".repeat(100) },
        { type: "text", text: "B".repeat(50) },
      ],
      usage: { input: 20, output: 9, cacheRead: 0, cacheWrite: 0, totalTokens: 29, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Think carefully",
      messages: [],
    });

    expect(result.reasoningTokens).toBe(6); // round(9 * 100/150)
    expect(result.completionTokens).toBe(9);
    expect(result.content).toBe("B".repeat(50));
  });

  it("returns full completionTokens as reasoningTokens when there is only thinking and no text", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Just thinking..." },
      ],
      usage: { input: 10, output: 7, cacheRead: 0, cacheWrite: 0, totalTokens: 17, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Think",
      messages: [],
    });

    expect(result.reasoningTokens).toBe(7);
    expect(result.completionTokens).toBe(7);
  });

  it("returns thinkingContent concatenating all thinking blocks", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Step one: consider the problem." },
        { type: "thinking", thinking: " Step two: solve it." },
        { type: "text", text: "The answer is 42." },
      ],
      usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 6*7?",
      messages: [],
    });

    expect(result.thinkingContent).toBe("Step one: consider the problem. Step two: solve it.");
    expect(result.content).toBe("The answer is 42.");
  });

  it("returns empty thinkingContent when there are no thinking blocks", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "Straight answer." }],
      usage: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(result.thinkingContent).toBe("");
  });

  it("includes reasoningTokens when agent is aborted with thinking blocks", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think..." },
        { type: "text", text: "Partial answer" },
      ],
      usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "aborted",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Tell me a story",
      messages: [],
    });

    expect(result.aborted).toBe(true);
    expect(result.reasoningTokens).toBeGreaterThan(0);
    expect(result.completionTokens).toBe(10);
  });

  it("uses the contextWindow parameter for model config", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      contextWindow: 8192,
      provider: "ollama",
    });

    expect(createOllamaModel).toHaveBeenCalledWith(
      expect.objectContaining({ contextWindow: 8192 }),
    );
  });

  it("creates an Ollama model when provider is \"ollama\"", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "ollama",
    });

    expect(createOllamaModel).toHaveBeenCalled();
  });

  it("creates an OpenAI model when provider is \"mlx\"", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "mlx-Qwen3-35B-A3B-4bit",
      baseUrl: "http://localhost:11435",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "mlx",
    });

    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mlx-Qwen3-35B-A3B-4bit",
        baseUrl: "http://localhost:11435",
        provider: "mlx",
        contextWindow: 0,
      }),
    );
  });

  it("falls back to createOpenAIModel when provider is omitted (no default)", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    // When provider is undefined and no factory matches, falls back to OpenAI-compat
    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "qwen3:8b",
        baseUrl: "http://localhost:11434",
      }),
    );
  });

  it("creates an Omlx model when provider is \"omlx\"", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "omlx-model",
      baseUrl: "http://localhost:8000",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "omlx",
    });

    expect(createOmlxModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "omlx-model",
        baseUrl: "http://localhost:8000",
      }),
    );
  });

  it("creates an OpenAI model when provider is \"lm-studio\"", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "lmstudio-model",
      baseUrl: "http://localhost:1234",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "lm-studio",
    });

    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lmstudio-model",
        baseUrl: "http://localhost:1234",
        provider: "lm-studio",
      }),
    );
  });

  it("includes write_agents_md tool when agentFolderBasePath and agentAlias are provided", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      agentFolderBasePath: "/data/agents",
      agentAlias: "my-agent",
    });

    expect(AgentMock).toHaveBeenCalledWith({
      initialState: expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "write_agents_md" }),
        ]),
      }),
    });
  });

  it("throws an error with errorMessage when model returns stopReason=error", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "I need to update the instructions..." },
      ],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "error",
      errorMessage: "Model context length exceeded",
      timestamp: Date.now(),
    });

    await expect(
      runAgent({
        modelId: "lfm2.5-thinking:latest",
        baseUrl: "http://localhost:11434",
        systemPrompt: "You are helpful.",
        prompt: "Update your instructions",
        messages: [],
      }),
    ).rejects.toThrow("Model context length exceeded");
  });

  it("throws a generic error when model returns stopReason=error without errorMessage", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think..." },
      ],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "error",
      timestamp: Date.now(),
    });

    await expect(
      runAgent({
        modelId: "lfm2.5-thinking:latest",
        baseUrl: "http://localhost:11434",
        systemPrompt: "You are helpful.",
        prompt: "Update your instructions",
        messages: [],
      }),
    ).rejects.toThrow("Model returned an error with no text content");
  });

  it("does not include write_agents_md tool when agentFolderBasePath is not provided", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(AgentMock).toHaveBeenCalledWith({
      initialState: expect.objectContaining({
        tools: [],
      }),
    });
  });

  it("includes pi built-in tools when toolNames is provided", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      toolNames: ["read", "bash"],
    });

    expect(AgentMock).toHaveBeenCalledWith({
      initialState: expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "read" }),
          expect.objectContaining({ name: "bash" }),
        ]),
      }),
    });
  });

  it("passes images to agent.prompt() when images are provided", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    const images = [
      { type: "image" as const, data: "iVBORw0KGgo=", mimeType: "image/png" },
    ];

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is in this image?",
      messages: [],
      images,
    });

    expect(mockAgent.prompt).toHaveBeenCalledWith("What is in this image?", images);
  });

  it("calls agent.prompt(prompt) without images when no images are provided", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hello",
      messages: [],
    });

    expect(mockAgent.prompt).toHaveBeenCalledWith("Hello");
  });

  it("calls agent.prompt(prompt) without images when images array is empty", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hello",
      messages: [],
      images: [],
    });

    expect(mockAgent.prompt).toHaveBeenCalledWith("Hello");
  });

  it("scopes pi tool cwd to .agents/<alias> when agentFolderBasePath and agentAlias are set", async () => {
    const AgentMock = (await import("@mariozechner/pi-agent-core")).Agent;
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      agentFolderBasePath: "/data/agents",
      agentAlias: "my-agent",
      toolNames: ["read"],
    });

    const tools = AgentMock.mock.calls[0][0].initialState.tools as Array<{ name: string; cwd: string }>;
    const readTool = tools.find((t) => t.name === "read");
    expect(readTool?.cwd).toBe(join("/data/agents", ".agents", "my-agent"));
  });
});

// ── resolveTools ──────────────────────────────────────────────────────

describe("resolveTools", () => {
  it("resolves valid tool names to tool instances", () => {
    const tools = resolveTools(["read", "bash"], "/tmp");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toHaveProperty("name", "read");
    expect(tools[1]).toHaveProperty("name", "bash");
  });

  it("resolves all 7 valid tool names", () => {
    const tools = resolveTools(["read", "bash", "edit", "write", "grep", "find", "ls"], "/tmp");
    expect(tools).toHaveLength(7);
    const names = tools.map((t: any) => t.name);
    expect(names).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls"]);
  });

  it("skips invalid tool names", () => {
    const tools = resolveTools(["read", "invalid", "bash"], "/tmp");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toHaveProperty("name", "read");
    expect(tools[1]).toHaveProperty("name", "bash");
  });

  it("returns empty array for empty input", () => {
    const tools = resolveTools([], "/tmp");
    expect(tools).toHaveLength(0);
  });

  it("returns empty array when all names are invalid", () => {
    const tools = resolveTools(["foo", "bar"], "/tmp");
    expect(tools).toHaveLength(0);
  });
});

// ── Streaming (onEvent callback) ──────────────────────────────────────

describe("runAgent streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.state.messages = [];
    mockAgent.prompt.mockResolvedValue(undefined);
    mockAgent.waitForIdle.mockResolvedValue(undefined);
    mockSubscribe.mockReset();
  });

  // Helper for streaming tests — pushes a minimal assistant message
  function pushAssistant(text = "ok") {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text }],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
  }

  it("does not subscribe to agent events when onEvent is not provided", async () => {
    pushAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("subscribes to agent events when onEvent is provided", async () => {
    const onEvent = vi.fn();
    pushAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      onEvent,
    });

    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("forwards agent events to onEvent callback", async () => {
    const onEvent = vi.fn();

    // Capture the subscribe listener so we can emit events
    mockSubscribe.mockImplementation((listener: any) => {
      // Simulate agent emitting events
      listener(
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
        },
        new AbortController().signal,
      );
      listener(
        {
          type: "message_update",
          assistantMessageEvent: { type: "thinking_delta", delta: "Thinking...", contentIndex: 0 },
        },
        new AbortController().signal,
      );
      return () => {}; // unsubscribe fn
    });

    pushAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      onEvent,
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hello", contentIndex: 0 },
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message_update",
        assistantMessageEvent: { type: "thinking_delta", delta: "Thinking...", contentIndex: 0 },
      }),
    );
  });

  it("still returns the final result when onEvent is provided", async () => {
    const onEvent = vi.fn();
    pushAssistant("The answer is 42.");
    // Override the last message with proper usage
    mockAgent.state.messages[mockAgent.state.messages.length - 1] = {
      role: "assistant",
      content: [{ type: "text", text: "The answer is 42." }],
      usage: { input: 20, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 28, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "What is 6*7?",
      messages: [],
      onEvent,
    });

    expect(result.content).toBe("The answer is 42.");
    expect(result.promptTokens).toBe(20);
    expect(result.completionTokens).toBe(8);
  });

  it("unsubscribes from agent events after the run completes", async () => {
    const onEvent = vi.fn();
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    pushAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      onEvent,
    });

    expect(unsubscribe).toHaveBeenCalled();
  });

  it("unsubscribes even when the run throws", async () => {
    const onEvent = vi.fn();
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    // Don't push an assistant message → will throw

    await expect(
      runAgent({
        modelId: "qwen3:8b",
        baseUrl: "http://localhost:11434",
        systemPrompt: "You are helpful.",
        prompt: "Hi",
        messages: [],
        onEvent,
      }),
    ).rejects.toThrow("No assistant message found after agent loop");

    expect(unsubscribe).toHaveBeenCalled();
  });
});

// ── Abort signal handling ──────────────────────────────────────────────

describe("runAgent abort signal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.state.messages = [];
    mockAgent.prompt.mockResolvedValue(undefined);
    mockAgent.waitForIdle.mockResolvedValue(undefined);
    mockSubscribe.mockReset();
    mockAgent.abort = vi.fn();
  });

  function pushAbortedAssistant(partialText = "Partial text...") {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: partialText }],
      usage: { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 13, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "aborted",
      timestamp: Date.now(),
    });
  }

  it("returns partial content with aborted=true when agent is aborted", async () => {
    pushAbortedAssistant("I was thinking about...");

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Tell me a story",
      messages: [],
    });

    expect(result.content).toBe("I was thinking about...");
    expect(result.aborted).toBe(true);
    expect(result.promptTokens).toBe(10);
    expect(result.completionTokens).toBe(3);
  });

  it("calls agent.abort() when the abort signal fires", async () => {
    pushAbortedAssistant();
    const abortController = new AbortController();

    // Delay the prompt to simulate a running agent
    let resolvePrompt: () => void;
    mockAgent.prompt.mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolvePrompt = resolve;
      });
    });

    const runPromise = runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      signal: abortController.signal,
    });

    // Abort the signal
    abortController.abort();

    // Verify agent.abort() was called
    expect(mockAgent.abort).toHaveBeenCalled();

    // Resolve the pending prompt so the test doesn't hang
    resolvePrompt!();
    await runPromise;
  });

  it("returns empty content when signal is already aborted before run", async () => {
    const abortController = new AbortController();
    abortController.abort(); // Already aborted

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      signal: abortController.signal,
    });

    expect(result.content).toBe("");
    expect(result.aborted).toBe(true);
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    // Should not have called prompt since we short-circuited
    expect(mockAgent.prompt).not.toHaveBeenCalled();
  });

  it("returns aborted result with empty text when aborted assistant has no text blocks", async () => {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [], // No text blocks
      usage: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 5, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "aborted",
      timestamp: Date.now(),
    });

    const result = await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
    });

    expect(result.content).toBe("");
    expect(result.aborted).toBe(true);
  });
});

// ── Model Factory Registry ──────────────────────────────────────────────

describe("model factory registry", () => {
  const customFactory = vi.fn(() => ({
    id: "custom-model",
    name: "custom-model",
    api: "custom",
    provider: "custom",
    baseUrl: "http://localhost:9999",
    reasoning: true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 4096,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent.state.messages = [];
    mockAgent.prompt.mockResolvedValue(undefined);
    mockAgent.waitForIdle.mockResolvedValue(undefined);
    mockSubscribe.mockReset();
    // Reset the registry for each test
    clearModelFactories();
  });

  afterEach(() => {
    // Restore the ollama factory so other describe blocks aren't affected
    clearModelFactories();
    registerModelFactory("ollama", (opts) => createOllamaModel({
      id: opts.id,
      baseUrl: opts.baseUrl,
      contextWindow: opts.contextWindow ?? 0,
    }));
  });

  function pushMinimalAssistant() {
    mockAgent.state.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
  }

  it("uses registered factory when provider matches", async () => {
    registerModelFactory("custom", customFactory);
    pushMinimalAssistant();

    await runAgent({
      modelId: "custom-model",
      baseUrl: "http://localhost:9999",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "custom",
    });

    expect(customFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom-model",
        baseUrl: "http://localhost:9999",
        provider: "custom",
        contextWindow: 0,
      }),
    );
    // Should NOT call createOpenAIModel
    expect(createOpenAIModel).not.toHaveBeenCalled();
  });

  it("falls back to createOpenAIModel when provider has no registered factory", async () => {
    // Only register "custom", not "mlx"
    registerModelFactory("custom", customFactory);
    pushMinimalAssistant();

    await runAgent({
      modelId: "mlx-model",
      baseUrl: "http://localhost:11435",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "mlx",
    });

    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mlx-model",
        baseUrl: "http://localhost:11435",
        provider: "mlx",
      }),
    );
  });

  it("falls back to createOpenAIModel when provider is undefined and registry is empty", async () => {
    pushMinimalAssistant();

    await runAgent({
      modelId: "some-model",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      // provider intentionally omitted
    });

    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "some-model",
        baseUrl: "http://localhost:11434",
      }),
    );
  });

  it("uses ollama factory when registered and provider is ollama", async () => {
    registerModelFactory("ollama", (opts) => createOllamaModel({
      id: opts.id,
      baseUrl: opts.baseUrl,
      contextWindow: opts.contextWindow ?? 0,
    }));
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "ollama",
    });

    expect(createOllamaModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "qwen3:8b",
        baseUrl: "http://localhost:11434",
        contextWindow: 0,
      }),
    );
    expect(createOpenAIModel).not.toHaveBeenCalled();
  });

  it("passes contextWindow and provider to factory", async () => {
    registerModelFactory("custom", customFactory);
    pushMinimalAssistant();

    await runAgent({
      modelId: "custom-model",
      baseUrl: "http://localhost:9999",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "custom",
      contextWindow: 65536,
    });

    expect(customFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        contextWindow: 65536,
        provider: "custom",
      }),
    );
  });

  it("can register multiple factories", async () => {
    const ollamaFactory = vi.fn(() => ({
      id: "ollama-model", api: "ollama", provider: "ollama", baseUrl: "http://localhost:11434",
      reasoning: true, input: ["text"] as const, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 0, maxTokens: 32000, name: "ollama-model",
    }));
    registerModelFactory("ollama", ollamaFactory);
    registerModelFactory("custom", customFactory);
    pushMinimalAssistant();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "ollama",
    });

    expect(ollamaFactory).toHaveBeenCalled();
    expect(customFactory).not.toHaveBeenCalled();
  });

  it("clearModelFactories removes all registrations", async () => {
    registerModelFactory("ollama", (opts) => createOllamaModel({
      id: opts.id,
      baseUrl: opts.baseUrl,
      contextWindow: opts.contextWindow ?? 0,
    }));
    pushMinimalAssistant();

    // Clear all — now even "ollama" should fall back to openai
    clearModelFactories();

    await runAgent({
      modelId: "qwen3:8b",
      baseUrl: "http://localhost:11434",
      systemPrompt: "You are helpful.",
      prompt: "Hi",
      messages: [],
      provider: "ollama",
    });

    expect(createOpenAIModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "qwen3:8b",
        provider: "ollama",
      }),
    );
  });
});
