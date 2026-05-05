import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/routes.js";
import type { Registry, HostInfo } from "../src/registry.js";
import type { AgentRouter } from "../src/agent-router.js";

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

function mockAgentRouter(): AgentRouter & {
  setHandler: (fn: (...args: unknown[]) => Promise<unknown>) => void;
} {
  let handler: (...args: unknown[]) => Promise<unknown>;
  return {
    setHandler(fn) {
      handler = fn;
    },
    registerHost: vi.fn(),
    unregisterHost: vi.fn(),
    request: vi.fn().mockImplementation((...args: unknown[]) => handler(...args)),
    destroy: vi.fn(),
  };
}

const hostA: HostInfo = {
  id: "host-a",
  hostname: "laptop",
  connectedAt: "",
  lastHeartbeat: "",
  ollamaVersion: "1.0",
  models: [],
  status: "online",
};

// ── POST /api/workspaces/:workspaceId/chats ────────────────────────────────

describe("POST /api/workspaces/:workspaceId/chats", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when body is missing hostId", async () => {
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspaces/w1/chats")
      .send({ title: "My Chat" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspaces/w1/chats")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });

  it("relays create-workspace-chat to the host and returns the chat", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("create-workspace-chat");
      expect(req.payload).toMatchObject({ workspaceId: "w1", title: "My Chat" });
      return { id: "wc1", workspaceId: "w1", title: "My Chat" };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspaces/w1/chats")
      .send({ hostId: "host-a", title: "My Chat" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "wc1", workspaceId: "w1", title: "My Chat" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("Workspace not found: w1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspaces/w1/chats")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── GET /api/workspaces/:workspaceId/chats ─────────────────────────────────

describe("GET /api/workspaces/:workspaceId/chats", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when query param hostId is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/chats");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/chats?hostId=host-a");

    expect(res.status).toBe(404);
  });

  it("relays list-workspace-chats to the host and returns the chats", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("list-workspace-chats");
      expect(req.payload).toMatchObject({ workspaceId: "w1" });
      return [
        { id: "wc1", workspaceId: "w1", title: "Chat 1" },
        { id: "wc2", workspaceId: "w1", title: "Chat 2" },
      ];
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/chats?hostId=host-a");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ id: "wc1", workspaceId: "w1", title: "Chat 1" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("Workspace not found: w1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/chats?hostId=host-a");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── GET /api/workspace-chats/:chatId ───────────────────────────────────────

describe("GET /api/workspace-chats/:chatId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 502 when no hosts connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspace-chats/wc1");

    expect(res.status).toBe(502);
  });

  it("relays get-workspace-chat to host and returns chat with messages", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("get-workspace-chat");
      expect(req.payload).toMatchObject({ workspaceChatId: "wc1" });
      return {
        chat: { id: "wc1", workspaceId: "w1", title: "My Chat" },
        messages: [
          { id: "m1", senderType: "user", content: "hello" },
          { id: "m2", senderType: "agent", senderId: "a1", content: "hi there" },
        ],
      };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspace-chats/wc1");

    expect(res.status).toBe(200);
    expect(res.body.chat).toEqual({ id: "wc1", workspaceId: "w1", title: "My Chat" });
    expect(res.body.messages).toHaveLength(2);
  });

  it("tries next host when first returns not found", async () => {
    const hostB: HostInfo = {
      id: "host-b",
      hostname: "desktop",
      connectedAt: "",
      lastHeartbeat: "",
      ollamaVersion: "1.0",
      models: [],
      status: "online",
    };
    reg.setHosts([hostA, hostB]);

    let callCount = 0;
    ar.setHandler(async (hostId: string) => {
      callCount++;
      if (hostId === "host-a") {
        throw new Error("workspace chat not found: wc1");
      }
      return {
        chat: { id: "wc1", workspaceId: "w1", title: "Found on B" },
        messages: [],
      };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspace-chats/wc1");

    expect(res.status).toBe(200);
    expect(res.body.chat.title).toBe("Found on B");
    expect(callCount).toBe(2);
  });

  it("returns 404 when no host has the chat", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("workspace chat not found: wc1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspace-chats/wc1");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

// ── POST /api/workspace-chats/:chatId/messages ─────────────────────────────

describe("POST /api/workspace-chats/:chatId/messages", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when prompt is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ agentIds: ["a1"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("prompt");
  });

  it("returns 400 when agentIds is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentIds");
  });

  it("returns 400 when agentIds is empty", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentIds");
  });

  it("returns 502 when no hosts connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: ["a1"] });

    expect(res.status).toBe(502);
  });

  it("relays send-workspace-message to host and returns responses", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("send-workspace-message");
      expect(req.payload).toMatchObject({
        workspaceChatId: "wc1",
        prompt: "hello",
        agentIds: ["a1", "a2"],
      });
      return {
        responses: [
          { response: "Response from A1", agentId: "a1" },
          { response: "Response from A2", agentId: "a2" },
        ],
        workspaceChatId: "wc1",
      };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: ["a1", "a2"] });

    expect(res.status).toBe(200);
    expect(res.body.responses).toHaveLength(2);
    expect(res.body.workspaceChatId).toBe("wc1");
  });

  it("returns partial results with error when an agent fails", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => ({
      responses: [{ response: "Partial", agentId: "a1" }],
      error: { agentId: "a2", message: "generation failed" },
      workspaceChatId: "wc1",
    }));

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: ["a1", "a2"] });

    expect(res.status).toBe(200);
    expect(res.body.responses).toHaveLength(1);
    expect(res.body.error).toEqual({ agentId: "a2", message: "generation failed" });
  });

  it("returns 400 when host rejects with agent not found", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("agent not found: a1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: ["a1"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agent not found");
  });

  it("returns 502 when host connection fails", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("connection timed out");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .post("/api/workspace-chats/wc1/messages")
      .send({ prompt: "hello", agentIds: ["a1"] });

    expect(res.status).toBe(502);
  });
});
