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
  providers: [{ name: "ollama", version: "0.3.5" }],
  models: [],
  status: "online",
};

describe("POST /api/workspace-chats/:chatId/messages/stream", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ agentIds: ["a1"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("prompt");
  });

  it("returns 400 when agentIds is missing", async () => {
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentIds");
  });

  it("returns 400 when agentIds is empty", async () => {
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentIds");
  });

  it("returns 502 when no hosts are connected", async () => {
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: ["a1"] });
    expect(res.status).toBe(502);
  });

  it("streams SSE events with workspace_agent_start/end and text_delta per agent", async () => {
    reg.setHosts([testHost]);

    // Simulate two agents streaming sequentially
    async function* fakeEvents() {
      yield {
        type: "stream",
        id: "1",
        event: { type: "workspace_agent_start", agentId: "a1", agentName: "Writer" },
      };
      yield {
        type: "stream",
        id: "1",
        event: {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hello" },
          agentId: "a1",
        },
      };
      yield {
        type: "stream",
        id: "1",
        event: {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: " from Writer" },
          agentId: "a1",
        },
      };
      yield {
        type: "stream",
        id: "1",
        event: { type: "workspace_agent_end", agentId: "a1" },
      };
      yield {
        type: "stream",
        id: "1",
        event: { type: "workspace_agent_start", agentId: "a2", agentName: "Reviewer" },
      };
      yield {
        type: "stream",
        id: "1",
        event: {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Looks good" },
          agentId: "a2",
        },
      };
      yield {
        type: "stream",
        id: "1",
        event: { type: "workspace_agent_end", agentId: "a2" },
      };
    }

    ar.setStreamHandler(async () => ({
      events: fakeEvents(),
      result: Promise.resolve({
        responses: [
          { response: "Hello from Writer", agentId: "a1" },
          { response: "Looks good", agentId: "a2" },
        ],
        workspaceChatId: "wc1",
      }),
    }));

    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: ["a1", "a2"] });

    expect(res.status).toBe(200);

    // workspace_agent_start events emitted as their own SSE event type
    expect(res.text).toContain("event: workspace_agent_start");
    expect(res.text).toContain('"agentName":"Writer"');
    expect(res.text).toContain('"agentName":"Reviewer"');

    // workspace_agent_end events emitted as their own SSE event type
    expect(res.text).toContain("event: workspace_agent_end");

    // text_delta events (flattened from message_update) include agentId
    expect(res.text).toContain("event: text_delta");
    expect(res.text).toContain('"agentId":"a1"');
    expect(res.text).toContain('"agentId":"a2"');

    // Done event with final result
    expect(res.text).toContain("event: done");
    expect(res.text).toContain("workspaceChatId");
  });

  it("sends error SSE event when host request fails", async () => {
    reg.setHosts([testHost]);

    ar.setStreamHandler(async () => ({
      events: (async function* () { /* no events */ })(),
      result: Promise.reject(new Error("agent not found: a1")),
    }));

    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: ["a1"] });

    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("agent not found");
  });

  it("sends error SSE event when no host can start streaming", async () => {
    reg.setHosts([testHost]);

    ar.setStreamHandler(async () => {
      throw new Error("host unavailable");
    });

    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: ["a1"] });

    // SSE error sent before stream events
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("host unavailable");
  });

  it("passes chatId, prompt, and agentIds in the request payload", async () => {
    reg.setHosts([testHost]);

    let capturedPayload: unknown = null;
    ar.setStreamHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      capturedPayload = req.payload;
      return {
        events: (async function* () {})(),
        result: Promise.resolve({ responses: [], workspaceChatId: "wc1" }),
      } as StreamResult;
    });

    await request(app)
      .post("/api/workspace-chats/wc1/messages/stream")
      .send({ prompt: "hello", agentIds: ["a1", "a2"] });

    expect(capturedPayload).toMatchObject({
      workspaceChatId: "wc1",
      prompt: "hello",
      agentIds: ["a1", "a2"],
    });
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
        event: { type: "workspace_agent_start", agentId: "a1", agentName: "Writer" },
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
        path: "/api/workspace-chats/wc1/messages/stream",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Wait for first SSE data then destroy the connection
      await new Promise<void>((resolve) => {
        clientReq.on("response", (res) => {
          res.on("data", (chunk: Buffer) => {
            if (chunk.toString().includes("workspace_agent_start")) {
              clientReq.destroy();
              resolve();
            }
          });
        });
        clientReq.write(JSON.stringify({ prompt: "hello", agentIds: ["a1"] }));
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
