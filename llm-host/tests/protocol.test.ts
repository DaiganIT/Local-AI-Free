import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildRegisterMessage, buildHeartbeatMessage, parseIncomingMessage } from "../src/protocol.js";
import type { IncomingMessage, RegisterMessage } from "../src/protocol.js";

describe("buildRegisterMessage", () => {
  it("serializes a register message with hostname, version, and models", () => {
    const json = buildRegisterMessage("my-host", "0.3.5", [
      { name: "llama3.2", size: 2019392832 },
      { name: "phi3", size: 1929381837 },
    ], "test-key");

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "register",
      hostname: "my-host",
      ollamaVersion: "0.3.5",
      models: [
        { name: "llama3.2", size: 2019392832 },
        { name: "phi3", size: 1929381837 },
      ],
      apiKey: "test-key",
    });
  });

  it("includes apiKey in the register message", () => {
    const json = buildRegisterMessage("my-host", "0.3.5", [
      { name: "llama3.2", size: 2019392832 },
    ], "secret-key-123");

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "register",
      hostname: "my-host",
      ollamaVersion: "0.3.5",
      models: [{ name: "llama3.2", size: 2019392832 }],
      apiKey: "secret-key-123",
    });
  });
});

describe("buildHeartbeatMessage", () => {
  it("serializes a heartbeat message with models", () => {
    const json = buildHeartbeatMessage([
      { name: "llama3.2", size: 2019392832 },
    ]);

    const msg = JSON.parse(json);
    expect(msg).toEqual({
      type: "heartbeat",
      models: [{ name: "llama3.2", size: 2019392832 }],
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
