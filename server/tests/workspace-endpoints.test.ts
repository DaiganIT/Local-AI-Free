import { EventEmitter } from "events";
import request from "supertest";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../src/routes.js";
import type { Registry } from "../src/registry.js";
import type { HostInfo } from "../src/types.js";
import type { AgentRouter } from "../src/agent-router.js";
import { createAgentRouter } from "../src/agent-router.js";

function mockRegistry(): Registry {
  return {
    registerHost: vi.fn(),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn().mockReturnValue([] as HostInfo[]),
  };
}

/** Fake WS socket that auto-responds to requests. */
class AutoRespondingSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1;
  responseData: unknown = [];
  responseError?: string;

  send(data: string) {
    this.sent.push(data);
    const msg = JSON.parse(data);
    queueMicrotask(() => {
      if (this.responseError) {
        this.emit("message", JSON.stringify({
          type: "response",
          id: msg.id,
          error: this.responseError,
        }));
      } else {
        this.emit("message", JSON.stringify({
          type: "response",
          id: msg.id,
          data: this.responseData,
        }));
      }
    });
  }

  close() {}
}

const hostA: HostInfo = {
  id: "host-a",
  hostname: "laptop",
  connectedAt: "",
  lastHeartbeat: "",
  providers: [{ name: "ollama", version: "1.0" }],
  models: [],
  status: "online",
};

const hostB: HostInfo = {
  id: "host-b",
  hostname: "desktop",
  connectedAt: "",
  lastHeartbeat: "",
  providers: [{ name: "ollama", version: "1.0" }],
  models: [],
  status: "online",
};

// ── GET /api/workspaces ──────────────────────────────────────────────────────

describe("GET /api/workspaces", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns empty array when no hosts connected", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("aggregates workspaces from all connected hosts", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseData = [{ id: "w1", name: "Project X" }];
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = [
      { id: "w2", name: "Project Y" },
      { id: "w3", name: "Project Z" },
    ];
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body).toEqual([
      { id: "w1", name: "Project X", hostId: "host-a" },
      { id: "w2", name: "Project Y", hostId: "host-b" },
      { id: "w3", name: "Project Z", hostId: "host-b" },
    ]);
  });

  it("returns 502 when ALL hosts fail", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);
    // No socket registered — host-a will fail

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces");

    expect(res.status).toBe(502);
  });

  it("returns partial results when some hosts fail", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseData = [{ id: "w1", name: "Project X" }];
    router.registerHost("host-a", socketA);
    // hostB has no socket

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({ id: "w1", name: "Project X", hostId: "host-a" });
  });

  it("sends list-workspaces action to each host", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socketA = new AutoRespondingSocket();
    socketA.responseData = [];
    router.registerHost("host-a", socketA);

    const app = createApp(reg, undefined, router);
    await request(app).get("/api/workspaces");

    const sentMsg = JSON.parse(socketA.sent[0]);
    expect(sentMsg.action).toBe("list-workspaces");
    expect(sentMsg.payload).toEqual({});
  });
});

// ── POST /api/workspaces ─────────────────────────────────────────────────────

describe("POST /api/workspaces", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 400 when body is missing hostId", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces")
      .send({ name: "My Workspace" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces")
      .send({ hostId: "host-a", name: "My Workspace" });
    expect(res.status).toBe(404);
  });

  it("relays create-workspace request to the host and returns the workspace", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { id: "w1", name: "My Workspace", path: "my-workspace" };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces")
      .send({ hostId: "host-a", name: "My Workspace" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "w1", name: "My Workspace", path: "my-workspace" });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("create-workspace");
    expect(sentMsg.payload.name).toBe("My Workspace");
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "missing required field: name";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing required field: name");
  });
});

// ── GET /api/workspaces/:workspaceId ──────────────────────────────────────────

describe("GET /api/workspaces/:workspaceId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 502 when no hosts connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces/w1");
    expect(res.status).toBe(502);
  });

  it("returns workspace when found on a host", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { id: "w1", name: "Project X", path: "project-x" };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces/w1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "w1", name: "Project X", path: "project-x" });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("get-workspace");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1" });
  });

  it("tries next host when first returns not found", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "workspace not found: w1";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = { id: "w1", name: "Project X", path: "project-x" };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces/w1");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Project X");
  });

  it("returns 404 when no host has the workspace", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "workspace not found: w1";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces/w1");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

// ── PUT /api/workspaces/:workspaceId ──────────────────────────────────────────

describe("PUT /api/workspaces/:workspaceId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 502 when no hosts connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app).put("/api/workspaces/w1").send({ name: "Updated" });
    expect(res.status).toBe(502);
  });

  it("relays update-workspace to host and returns updated workspace", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { id: "w1", name: "Updated", path: "project-x" };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/workspaces/w1")
      .send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "w1", name: "Updated", path: "project-x" });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("update-workspace");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1", name: "Updated" });
  });

  it("tries next host when first returns not found", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "workspace not found: w1";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = { id: "w1", name: "Updated", path: "project-x" };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/workspaces/w1")
      .send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("returns 400 when the host rejects the update", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "workspace not found: w1";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/workspaces/w1")
      .send({ name: "Updated" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── DELETE /api/workspaces/:workspaceId ───────────────────────────────────────

describe("DELETE /api/workspaces/:workspaceId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 502 when no hosts connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/workspaces/w1");
    expect(res.status).toBe(502);
  });

  it("relays delete-workspace to host and returns success", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { success: true };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/workspaces/w1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("delete-workspace");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1" });
  });

  it("tries next host when first fails", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "workspace not found: w1";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = { success: true };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/workspaces/w1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 502 when all hosts reject", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "workspace not found: w1";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseError = "workspace not found: w1";
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/workspaces/w1");

    expect(res.status).toBe(502);
  });
});

// ── POST /api/workspaces/:workspaceId/agents ─────────────────────────────────

describe("POST /api/workspaces/:workspaceId/agents", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 400 when body is missing agentId", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/w1/agents")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("agentId");
  });

  it("returns 400 when body is missing hostId", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/w1/agents")
      .send({ agentId: "a1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/w1/agents")
      .send({ agentId: "a1", hostId: "host-a" });

    expect(res.status).toBe(404);
  });

  it("relays add-agent-to-workspace to host and returns success", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { success: true };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/w1/agents")
      .send({ agentId: "a1", hostId: "host-a" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("add-agent-to-workspace");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1", agentId: "a1" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "workspace not found: w1";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/w1/agents")
      .send({ agentId: "a1", hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── DELETE /api/workspaces/:workspaceId/agents/:agentId ───────────────────────

describe("DELETE /api/workspaces/:workspaceId/agents/:agentId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 400 when body is missing hostId", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .delete("/api/workspaces/w1/agents/a1")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .delete("/api/workspaces/w1/agents/a1")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(404);
  });

  it("relays remove-agent-from-workspace to host and returns success", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { success: true };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .delete("/api/workspaces/w1/agents/a1")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("remove-agent-from-workspace");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1", agentId: "a1" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "workspace not found: w1";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .delete("/api/workspaces/w1/agents/a1")
      .send({ hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── GET /api/workspaces/:workspaceId/agents ─────────────────────────────────

describe("GET /api/workspaces/:workspaceId/agents", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  beforeEach(() => {
    reg = mockRegistry();
    router = createAgentRouter();
  });

  afterEach(() => {
    router.destroy();
    vi.restoreAllMocks();
  });

  it("returns 400 when query param hostId is missing", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/workspaces/w1/agents");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/workspaces/w1/agents?hostId=host-a");

    expect(res.status).toBe(404);
  });

  it("relays list-workspace-agents to host and returns agent IDs", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = ["agent-1", "agent-2"];
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/workspaces/w1/agents?hostId=host-a");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(["agent-1", "agent-2"]);

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("list-workspace-agents");
    expect(sentMsg.payload).toEqual({ workspaceId: "w1" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "workspace not found: w1";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/workspaces/w1/agents?hostId=host-a");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});
