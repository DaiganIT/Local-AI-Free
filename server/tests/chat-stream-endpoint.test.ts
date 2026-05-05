import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import http from "http";
import type { Registry, HostInfo } from "../src/registry.js";
import type { AgentRouter, StreamResult } from "../src/agent-router.js";
import type { AuthConfig } from "../src/auth.js";
import { createApp } from "../src/routes.js";

// ── Helpers ────────────────────────────────────────────────────────────────
function mockRegistry(): Registry & { setHosts: (hosts: HostInfo[]) => void } {
  const hosts: HostInfo[] = [];
  return {
    setHosts(newHosts) {
      hosts.length = 0;
      hosts.push(...newHosts);
    },
    registerHost: vi.fn(() => "host-1"),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: () => [...hosts],
  };
}

/** Returns a mock AgentRouter where streamRequest can be controlled and abortStream is tracked. */
function mockAgentRouter(): AgentRouter & {
  setStreamHandler: (fn: (...args: unknown[]) => Promise<StreamResult>) => void;
  abortStream: ReturnType<typeof vi.fn>;
} {
  let streamHandler: (...args: unknown[]) => Promise<StreamResult>;

  return {
    setStreamHandler(fn) { streamHandler = fn; },
    registerHost: vi.fn(),
    unregisterHost: vi.fn(),
    request: vi.fn().mockRejectedValue(new Error("not mocked")),
    async streamRequest(...args: unknown[]) {
      return streamHandler(...args);
    },
    abortStream: vi.fn(),
    destroy: vi.fn(),
  };
}

function createTestApp(reg: Registry, auth: AuthConfig | undefined, ar: AgentRouter) {
  return createApp(reg, auth, ar);
}

const testHost: HostInfo = {
  id: "host-1",
  hostname: "my-pc",
  connectedAt: "2024-01-01T00:00:00Z",
  lastHeartbeat: "2024-01-01T00:00:00Z",
  ollamaVersion: "0.3.5",
  models: [],
  status: "online",
};

describe("POST /api/chat/stream", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("returns 400 when agentId is missing", async () => {
    const res = await request(app).post("/api/chat/stream").send({ prompt: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentId");
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await request(app).post("/api/chat/stream").send({ agentId: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("prompt");
  });

  it("returns 502 when no hosts are connected", async () => {
    const res = await request(app)
      .post("/api/chat/stream")
      .send({ agentId: "agent-123", prompt: "hello" });
    expect(res.status).toBe(502);
  });

  it("streams SSE events from the host and closes with done", async () => {
    reg.setHosts([testHost]);

    // Create a controlled async iterable for stream events
    async function* fakeEvents() {
      yield {
        type: "stream",
        id: "1",
        event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } },
      };
      yield {
        type: "stream",
        id: "1",
        event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " world" } },
      };
    }

    ar.setStreamHandler(async () => ({
      events: fakeEvents(),
      result: Promise.resolve({ response: "Hello world", chatId: "c1", userMessageId: "m1" }),
    }));

    const res = await request(app)
      .post("/api/chat/stream")
      .send({ agentId: "agent-123", prompt: "hello" });

    expect(res.status).toBe(200);

    // Should contain SSE formatted events
    // message_update events are flattened to their inner type (text_delta)
    expect(res.text).toContain("event: text_delta");
    expect(res.text).toContain("Hello");
    expect(res.text).toContain("event: done");
    expect(res.text).toContain("chatId");
  });

  it("sends error SSE event when agent not found", async () => {
    reg.setHosts([testHost]);

    ar.setStreamHandler(async () => ({
      events: (async function* () { /* no events */ })(),
      result: Promise.reject(new Error("agent not found: agent-999")),
    }));

    const res = await request(app)
      .post("/api/chat/stream")
      .send({ agentId: "agent-999", prompt: "hello" });

    // SSE always returns 200 once headers are sent
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("agent not found");
  });

  it("sends error SSE event when host request fails", async () => {
    reg.setHosts([testHost]);

    ar.setStreamHandler(async () => ({
      events: (async function* () { /* no events */ })(),
      result: Promise.reject(new Error("connection timed out")),
    }));

    const res = await request(app)
      .post("/api/chat/stream")
      .send({ agentId: "agent-123", prompt: "hello" });

    // SSE always returns 200 once headers are sent
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("connection timed out");
  });

  it("calls abortStream when client disconnects mid-stream", async () => {
    reg.setHosts([testHost]);

    // Create a slow event generator that yields one event then waits
    let resolveBlock: () => void;
    const blockPromise = new Promise<void>((r) => { resolveBlock = r; });

    async function* slowEvents() {
      yield {
        type: "stream",
        id: "1",
        event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hel" } },
      };
      // Block so the stream stays open
      await blockPromise;
    }

    ar.setStreamHandler(async () => ({
      events: slowEvents(),
      result: new Promise(() => {}), // never resolves
      requestId: "test-req-1",
    }));

    // Use raw HTTP so we can abort mid-stream
    const server = http.createServer(app);
    await new Promise<void>((resolve) => { server.listen(0, () => resolve()); });
    const addr = server.address() as { port: number };

    try {
      const clientReq = http.request({
        hostname: "localhost",
        port: addr.port,
        path: "/api/chat/stream",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Wait for first SSE data then destroy the connection
      await new Promise<void>((resolve) => {
        clientReq.on("response", (res) => {
          res.on("data", (chunk: Buffer) => {
            if (chunk.toString().includes("text_delta")) {
              clientReq.destroy();
              resolve();
            }
          });
        });
        clientReq.write(JSON.stringify({ agentId: "agent-123", prompt: "hello" }));
        clientReq.end();
      });

      // Give the server a tick to process the close event
      await new Promise((r) => setTimeout(r, 100));

      // abortStream should have been called with the requestId
      expect(ar.abortStream).toHaveBeenCalledWith("test-req-1");
    } finally {
      server.close();
    }
  });
});
