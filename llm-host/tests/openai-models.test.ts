import { describe, it, expect } from "vitest";
import { createOpenAIModel } from "../src/providers/openai-models.js";
import type { Model } from "@mariozechner/pi-ai";

describe("createOpenAIModel", () => {
  it("creates a Model with api 'openai-completions'", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.api).toBe("openai-completions");
    expect(model.id).toBe("qwen3:8b");
    expect(model.provider).toBe("openai-completions");
  });

  it("sets default name from id", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.name).toBe("qwen3:8b");
  });

  it("allows custom name", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
      name: "Qwen3 8B",
    });

    expect(model.name).toBe("Qwen3 8B");
  });

  it("allows custom provider name", () => {
    const model = createOpenAIModel({
      id: "mlx-Qwen3-35B",
      baseUrl: "http://localhost:8080",
      provider: "mlx",
    });

    expect(model.provider).toBe("mlx");
  });

  it("sets default contextWindow of 131072", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.contextWindow).toBe(131072);
  });

  it("allows custom contextWindow", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
      contextWindow: 32768,
    });

    expect(model.contextWindow).toBe(32768);
  });

  it("sets default maxTokens of 32000", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.maxTokens).toBe(32000);
  });

  it("allows custom maxTokens", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
      maxTokens: 4096,
    });

    expect(model.maxTokens).toBe(4096);
  });

  it("defaults reasoning to true", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.reasoning).toBe(true);
  });

  it("allows reasoning to be false", () => {
    const model = createOpenAIModel({
      id: "llama-3b",
      baseUrl: "http://localhost:11435",
      reasoning: false,
    });

    expect(model.reasoning).toBe(false);
  });

  it("sets cost to zero for local models", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("sets input to ['text'] only", () => {
    const model = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.input).toEqual(["text"]);
  });

  it("returns type Model<'openai-completions'>", () => {
    const model: Model<"openai-completions"> = createOpenAIModel({
      id: "qwen3:8b",
      baseUrl: "http://localhost:11435",
    });

    expect(model.api).toBe("openai-completions");
  });
});
