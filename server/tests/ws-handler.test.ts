import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";
import { createWsHandler } from "../src/ws-handler.js";
import type { Registry, HostInfo } from "../src/registry.js";

// ── Mock registry ────────────────────────────────────────────────────────────
function mockRegistry(): Registry {
  return {
    registerHost: vi.fn(() => "host-1"),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn(() => [] as HostInfo[]),
  };
}

// ── Fake WebSocket (just an EventEmitter + send) ─────────────────────────────
class FakeSocket extends EventEmitter {
  sent: string[] = [];
  readyState: number = 1; // OPEN
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    // no-op for tests
  }
}

describe("ws-handler", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let handleConnection: (socket: FakeSocket) => void;

  beforeEach(() => {
    reg = mockRegistry();
    handleConnection = createWsHandler(reg, { allowedKeys: undefined });
  });

  function connect(): FakeSocket {
    const socket = new FakeSocket();
    handleConnection(socket);
    return socket;
  }

  it("sends back the host id on register", () => {
    const socket = connect();
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
    }));

    expect(socket.sent[0]).toBe('{"type":"registered","id":"host-1"}');
    expect(reg.registerHost).toHaveBeenCalledTimes(1);
  });

  it("calls registerHost with the right arguments", () => {
    const socket = connect();
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.7.0",
      models: [{ name: "llama3", size: 4700000000 }],
    }));

    expect(reg.registerHost).toHaveBeenCalledWith(
      socket,
      "my-pc",
      "1.7.0",
      [{ name: "llama3", size: 4700000000 }],
    );
  });

  it("ignores malformed JSON messages", () => {
    const socket = connect();
    // Should not throw
    socket.emit("message", "not json");
    expect(reg.registerHost).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(0);
  });

  it("calls updateHeartbeat after registration", () => {
    const socket = connect();
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
    }));

    socket.emit("message", JSON.stringify({
      type: "heartbeat",
      models: [{ name: "llama3", size: 5000000000 }],
    }));

    expect(reg.updateHeartbeat).toHaveBeenCalledWith("host-1", [{ name: "llama3", size: 5000000000 }]);
  });

  it("ignores heartbeat before registration", () => {
    const socket = connect();
    socket.emit("message", JSON.stringify({
      type: "heartbeat",
      models: [],
    }));

    expect(reg.updateHeartbeat).not.toHaveBeenCalled();
  });

  it("calls removeHost on close after registration", () => {
    const socket = connect();
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
    }));

    socket.emit("close");

    expect(reg.removeHost).toHaveBeenCalledWith("host-1");
  });

  it("does not call removeHost on close without registration", () => {
    const socket = connect();
    socket.emit("close");
    expect(reg.removeHost).not.toHaveBeenCalled();
  });
});

describe("ws-handler auth", () => {
  const VALID_KEYS = new Set(["secret-key"]);

  function connect(handler: (socket: FakeSocket) => void): FakeSocket {
    const socket = new FakeSocket();
    handler(socket);
    return socket;
  }

  it("accepts register when no auth is configured", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: undefined });
    const socket = connect(handler);
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
    }));
    expect(socket.sent[0]).toBe('{"type":"registered","id":"host-1"}');
  });

  it("accepts register when apiKey is valid", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: VALID_KEYS });
    const socket = connect(handler);
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
      apiKey: "secret-key",
    }));
    expect(socket.sent[0]).toBe('{"type":"registered","id":"host-1"}');
  });

  it("rejects register when apiKey is missing", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: VALID_KEYS });
    const socket = connect(handler);
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
    }));
    expect(socket.sent[0]).toBe('{"type":"error","message":"unauthorized"}');
    expect(reg.registerHost).not.toHaveBeenCalled();
  });

  it("rejects register when apiKey is wrong", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: VALID_KEYS });
    const socket = connect(handler);
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
      apiKey: "wrong-key",
    }));
    expect(socket.sent[0]).toBe('{"type":"error","message":"forbidden"}');
    expect(reg.registerHost).not.toHaveBeenCalled();
  });

  it("closes socket after auth rejection", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: VALID_KEYS });
    const socket = connect(handler);
    const closeSpy = vi.spyOn(socket, "close");
    socket.emit("message", JSON.stringify({
      type: "register",
      hostname: "my-pc",
      ollamaVersion: "1.0",
      models: [],
      apiKey: "wrong-key",
    }));
    expect(closeSpy).toHaveBeenCalled();
  });

  it("ignores heartbeat from unauthenticated socket", () => {
    const reg = mockRegistry();
    const handler = createWsHandler(reg, { allowedKeys: VALID_KEYS });
    const socket = connect(handler);
    socket.emit("message", JSON.stringify({
      type: "heartbeat",
      models: [],
    }));
    expect(reg.updateHeartbeat).not.toHaveBeenCalled();
  });
});
