import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import express from "express";
import request from "supertest";
import { createApp } from "../src/routes.js";
import type { Registry } from "../src/registry.js";
import type { HostInfo } from "../src/types.js";
import type { AgentRouter, StreamResult } from "../src/agent-router.js";
import { streamToSse } from "../src/sse.js";
import type { Response } from "express";

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockRegistry(hosts: HostInfo[] = []): Registry {
  return {
    registerHost: vi.fn(),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn().mockReturnValue(hosts),
  };
}

/** Create a mock AgentRouter that can produce stream results. */
function createMockRouter(): AgentRouter & {
  setStreamHandler: (fn: (hostId: string, req: { action: string; payload: unknown }) => StreamResult) => void;
} {
  let streamHandler: ((hostId: string, req: { action: string; payload: unknown }) => StreamResult) | null = null;

  return {
    registerHost: vi.fn(),
    unregisterHost: vi.fn(),
    request: vi.fn(),
    streamRequest: vi.fn().mockImplementation(async (hostId, req) => {
      if (!streamHandler) throw new Error("no stream handler");
      return streamHandler(hostId, req);
    }),
    abortStream: vi.fn(),
    destroy: vi.fn(),
    setStreamHandler(fn) {
      streamHandler = fn;
    },
  };
}

/** Create a StreamResult that yields the given events and resolves the result. */
function createStreamResult(
  events: Record<string, unknown>[],
  finalResult: unknown = { ok: true },
): StreamResult {
  const eventQueue: (Record<string, unknown> | null)[] = [...events];
  let resolveResult: (value: unknown) => void;
  const resultPromise = new Promise<unknown>((resolve) => { resolveResult = resolve; });

  // Resolve result after all events are consumed
  const asyncIterable: AsyncIterable<Record<string, unknown>> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (eventQueue.length === 0) {
            // End of stream
            resolveResult!(finalResult);
            return { value: undefined, done: true } as IteratorResult<Record<string, unknown>>;
          }
          const item = eventQueue.shift()!;
          return { value: item, done: false };
        },
      };
    },
  };

  return {
    events: asyncIterable,
    result: resultPromise,
    requestId: `stream-${Math.random().toString(36).slice(2, 8)}`,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("streamToSse", () => {
  const hostA: HostInfo = {
    id: "host-a",
    hostname: "laptop",
    connectedAt: "",
    lastHeartbeat: "",
    providers: [{ name: "ollama", version: "1.0" }],
    models: [],
    status: "online",
  };

  it("writes SSE headers", async () => {
    const router = createMockRouter();
    const streamResult = createStreamResult([], { ok: true });
    router.setStreamHandler(() => streamResult);

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["connection"]).toBe("keep-alive");
  });

  it("writes error event when no hosts connected", async () => {
    const router = createMockRouter();
    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain("event: error");
  });

  it("forwards stream events as SSE", async () => {
    const router = createMockRouter();
    const streamResult = createStreamResult(
      [
        { event: { type: "text_delta", text: "hello" } },
        { event: { type: "text_delta", text: " world" } },
      ],
      { response: "hello world" },
    );
    router.setStreamHandler(() => streamResult);

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain("event: text_delta");
    expect(res.text).toContain("hello");
    expect(res.text).toContain("event: done");
    expect(res.text).toContain("hello world");
  });

  it("flattens message_update events", async () => {
    const router = createMockRouter();
    const streamResult = createStreamResult(
      [
        {
          event: {
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", text: "hi" },
          },
        },
      ],
      { ok: true },
    );
    router.setStreamHandler(() => streamResult);

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain("event: text_delta");
    // The inner event should be flattened
    expect(res.text).toContain('"text":"hi"');
  });

  it("preserves agentId from outer event when preserveAgentId is true", async () => {
    const router = createMockRouter();
    const streamResult = createStreamResult(
      [
        {
          event: {
            type: "message_update",
            agentId: "agent-1",
            assistantMessageEvent: { type: "text_delta", text: "hi" },
          },
        },
      ],
      { ok: true },
    );
    router.setStreamHandler(() => streamResult);

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA], router, { action: "send-message", payload: {}, preserveAgentId: true });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain('"agentId":"agent-1"');
  });

  it("writes error event when all hosts fail to start stream", async () => {
    const router = createMockRouter();
    router.streamRequest = vi.fn().mockRejectedValue(new Error("host not found"));

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("host not found");
  });

  it("tries next host on failure", async () => {
    const hostB: HostInfo = { ...hostA, id: "host-b" };
    const router = createMockRouter();

    // host-a fails, host-b succeeds
    let callCount = 0;
    router.streamRequest = vi.fn().mockImplementation(async (hostId, _req) => {
      if (hostId === "host-a") throw new Error("not found");
      return createStreamResult([], { ok: true });
    });

    const app = express();
    app.get("/test", (req, res) => {
      streamToSse(res, [hostA, hostB], router, { action: "send-message", payload: {} });
    });

    const res = await request(app).get("/test");
    expect(res.text).toContain("event: done");
  });
});