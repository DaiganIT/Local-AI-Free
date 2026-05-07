import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildRegisterMessage, buildHeartbeatMessage, parseIncomingMessage } from "../src/protocol.js";
import type { IncomingMessage, RegisterMessage, ModelInfo } from "../src/protocol.js";

describe("buildRegisterMessage", () => {
  it("serializes a register message with hostname, providers, and models", () => {
    const json = buildRegisterMessage("my-host", [
      { name: "ollama", version: "0.3.5" },
    ], [
      { name: "llama3.2", size: 2019392832, provider: "ollama" },
      { name: "phi3", size: 1929381837, provider: "ollama" },
    ], "test-key");

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "register",
      hostname: "my-host",
      providers: [{ name: "ollama", version: "0.3.5" }],
      models: [
        { name: "llama3.2", size: 2019392832, provider: "ollama" },
        { name: "phi3", size: 1929381837, provider: "ollama" },
      ],
      apiKey: "test-key",
    });
  });

  it("includes apiKey in the register message", () => {
    const json = buildRegisterMessage("my-host", [
      { name: "ollama", version: "0.3.5" },
    ], [
      { name: "llama3.2", size: 2019392832, provider: "ollama" },
    ], "secret-key-123");

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "register",
      hostname: "my-host",
      providers: [{ name: "ollama", version: "0.3.5" }],
      models: [{ name: "llama3.2", size: 2019392832, provider: "ollama" }],
      apiKey: "secret-key-123",
    });
  });

  it("supports multiple providers", () => {
    const json = buildRegisterMessage("my-host", [
      { name: "ollama", version: "0.3.5" },
      { name: "mlx", version: "mlx-omni-server" },
    ], [
      { name: "llama3.2", size: 2019392832, provider: "ollama" },
      { name: "qwen2.5", size: 0, provider: "mlx" },
    ], "test-key");

    const msg = JSON.parse(json);
    expect(msg.providers).toHaveLength(2);
    expect(msg.models).toHaveLength(2);
  });
});

describe("buildHeartbeatMessage", () => {
  it("serializes a heartbeat message with models", () => {
    const json = buildHeartbeatMessage([
      { name: "llama3.2", size: 2019392832, provider: "ollama" },
    ]);

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "heartbeat",
      models: [{ name: "llama3.2", size: 2019392832, provider: "ollama" }],
    });
  });

  it("handles empty models list", () => {
    const json = buildHeartbeatMessage([]);

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "heartbeat",
      models: [],
    });
  });
});

describe("parseIncomingMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a registered message", () => {
    const msg = parseIncomingMessage('{"type":"registered","id":"host-abc-123"}');
    expect(msg).toEqual({ type: "registered", id: "host-abc-123" });
  });

  it("parses a ping message", () => {
    const msg = parseIncomingMessage('{"type":"ping"}');
    expect(msg).toEqual({ type: "ping" });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseIncomingMessage("not json")).toThrow();
  });
});
