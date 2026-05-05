import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Registry, HostInfo } from "../src/registry.js";
import type { AgentRouter } from "../src/agent-router.js";
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

function mockAgentRouter(): AgentRouter & { setHandler: (fn: (...args: unknown[]) => Promise<unknown>) => void } {
  let handler: (...args: unknown[]) => Promise<unknown>;
  return {
    setHandler(fn) { handler = fn; },
    registerHost: vi.fn(),
    unregisterHost: vi.fn(),
    request: vi.fn().mockImplementation((...args: unknown[]) => handler(...args)),
    destroy: vi.fn(),
  };
}

function createTestApp(reg: Registry, auth: AuthConfig | undefined, ar: AgentRouter) {
  return createApp(reg, auth, ar);
}

describe("POST /api/chat", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    ar.setHandler(async () => "Test response");
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("returns 400 when agentId is missing", async () => {
    const res = await request(app).post("/api/chat").send({ prompt: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentId");
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await request(app).post("/api/chat").send({ agentId: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("prompt");
  });

  it("relays request to the correct host and returns the response", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async (hostId: string, req: { action: string; payload: unknown }) => {
      expect(hostId).toBe("host-1");
      expect(req.action).toBe("send-message");
      expect(req.payload).toMatchObject({ agentId: "agent-123", prompt: "hello" });
      return "The answer is 42.";
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ agentId: "agent-123", prompt: "hello" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ response: "The answer is 42." });
  });

  it("returns 400 when the agent is not found on any host", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async () => {
      throw new Error("agent not found: agent-999");
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ agentId: "agent-999", prompt: "hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agent not found");
  });

  it("returns 502 when all host requests fail", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async () => {
      throw new Error("connection timed out");
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ agentId: "agent-123", prompt: "hello" });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("connection timed out");
  });

  it("passes chatId through when provided", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    let receivedPayload: unknown;
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      receivedPayload = req.payload;
      return "Hi!";
    });

    await request(app)
      .post("/api/chat")
      .send({ agentId: "agent-123", prompt: "hello", chatId: "chat-1" });

    expect((receivedPayload as Record<string, unknown>).chatId).toBe("chat-1");
  });

  it("returns response with chatId and userMessageId when persisted", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async () => ({
      response: "Hi!",
      agentId: "agent-123",
      chatId: "chat-1",
      userMessageId: "msg-1",
    }));

    const res = await request(app)
      .post("/api/chat")
      .send({ agentId: "agent-123", prompt: "hello", chatId: "chat-1" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      response: "Hi!",
      agentId: "agent-123",
      chatId: "chat-1",
      userMessageId: "msg-1",
    });
  });
});

describe("GET /api/agents/:agentId/chats", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    ar.setHandler(async () => []);
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("relays list-chats request to the host that owns the agent", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    let receivedAction: string | undefined;
    let receivedPayload: unknown;
    ar.setHandler(async (_hostId, req) => {
      receivedAction = req.action;
      receivedPayload = req.payload;
      return [{ id: "c1", title: "First chat" }];
    });

    const res = await request(app).get("/api/agents/agent-1/chats");

    expect(res.status).toBe(200);
    expect(receivedAction).toBe("list-chats");
    expect((receivedPayload as Record<string, unknown>).agentId).toBe("agent-1");
    expect(res.body).toHaveLength(1);
  });

  it("returns 200 with empty array when agent not found", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async () => { throw new Error("agent not found"); });

    const res = await request(app).get("/api/agents/non-existent/chats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/agents/:agentId/chats", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    ar.setHandler(async () => ({}));
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("relays create-chat request and returns 201", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    let receivedPayload: unknown;
    ar.setHandler(async (_hostId, req) => {
      receivedPayload = req.payload;
      return { id: "chat-1", title: "New chat", totalPromptTokens: 0 };
    });

    const res = await request(app)
      .post("/api/agents/agent-1/chats")
      .send({ title: "My first conversation" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "chat-1", title: "New chat" });
    expect((receivedPayload as Record<string, unknown>).agentId).toBe("agent-1");
    expect((receivedPayload as Record<string, unknown>).title).toBe("My first conversation");
  });
});

describe("GET /api/chats/:chatId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    ar.setHandler(async () => ({}));
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("fans out get-chat to all hosts, first to respond wins", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async (_hostId, req) => {
      expect(req.action).toBe("get-chat");
      expect((req.payload as Record<string, unknown>).chatId).toBe("chat-1");
      return {
        chat: { id: "chat-1", title: "Hello" },
        messages: [{ id: "m1", role: "user", content: "hi" }],
      };
    });

    const res = await request(app).get("/api/chats/chat-1");

    expect(res.status).toBe(200);
    expect(res.body.chat).toMatchObject({ id: "chat-1" });
    expect(res.body.messages).toHaveLength(1);
  });

  it("returns 404 when chat not found on any host (agent not found errors)", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    ar.setHandler(async () => { throw new Error("agent not found"); });

    const res = await request(app).get("/api/chats/non-existent");

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/chats/:chatId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;
  let app: express.Express;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
    ar.setHandler(async () => ({}));
    app = createTestApp(reg, { allowedKeys: undefined }, ar);
  });

  it("fans out delete-chat to all hosts", async () => {
    reg.setHosts([
      {
        id: "host-1",
        hostname: "my-pc",
        connectedAt: "2024-01-01T00:00:00Z",
        lastHeartbeat: "2024-01-01T00:00:00Z",
        ollamaVersion: "0.3.5",
        models: [],
        status: "online",
      },
    ]);

    let receivedAction: string | undefined;
    ar.setHandler(async (_hostId, req) => {
      receivedAction = req.action;
      return { success: true };
    });

    const res = await request(app).delete("/api/chats/chat-1");

    expect(res.status).toBe(200);
    expect(receivedAction).toBe("delete-chat");
  });
});
