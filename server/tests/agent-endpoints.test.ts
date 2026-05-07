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
    // Auto-respond on next tick so the router's pending promise is set up
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

describe("GET /api/agents", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

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
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("aggregates agents from all connected hosts", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseData = [{ id: "a1", name: "Researcher" }];
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = [
      { id: "b1", name: "Coder" },
      { id: "b2", name: "Writer" },
    ];
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body).toEqual([
      { id: "a1", name: "Researcher", hostId: "host-a" },
      { id: "b1", name: "Coder", hostId: "host-b" },
      { id: "b2", name: "Writer", hostId: "host-b" },
    ]);
  });

  it("includes hostId with each agent", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = [{ id: "a1", name: "Helper" }];
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents");

    expect(res.body[0].hostId).toBe("host-a");
  });

  it("returns 502 when ALL hosts are disconnected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);
    // Don't register socket for hostA — simulates disconnect

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(502);
  });

  it("returns partial results when some hosts are disconnected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    // Only hostA has a socket
    const socketA = new AutoRespondingSocket();
    socketA.responseData = [{ id: "a1", name: "Researcher" }];
    router.registerHost("host-a", socketA);
    // hostB has no socket — will fail

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({ id: "a1", name: "Researcher", hostId: "host-a" });
  });
});

describe("POST /api/agents", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

  const hostA: HostInfo = {
    id: "host-a",
    hostname: "laptop",
    connectedAt: "",
    lastHeartbeat: "",
    providers: [{ name: "ollama", version: "1.0" }],
    models: [],
    status: "online",
  };

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
      .post("/api/agents")
      .send({ name: "MyBot", model: "llama3" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when host is not connected", async () => {
    reg.listHosts = vi.fn().mockReturnValue([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents")
      .send({ hostId: "host-a", name: "MyBot", model: "llama3" });
    expect(res.status).toBe(404);
  });

  it("relays create-agent request to the host and returns the agent", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { id: "a1", name: "MyBot", model: "llama3" };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents")
      .send({ hostId: "host-a", name: "MyBot", model: "llama3" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "a1", name: "MyBot", model: "llama3" });
  });

  it("returns error when the host rejects the request", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseError = "missing required field: name";
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents")
      .send({ hostId: "host-a", name: "", model: "llama3" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing required field: name");
  });

  it("passes through metadata fields (instructions, tools, skills) to host", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = {
      id: "a1",
      name: "MyBot",
      model: "llama3",
      tools: [{ name: "search", description: "Search the web" }],
      skills: [{ name: "writing", description: "Creative writing" }],
    };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents")
      .send({
        hostId: "host-a",
        name: "MyBot",
        model: "llama3",
        instructions: "You are a helper",
        tools: [{ name: "search", description: "Search the web" }],
        skills: [{ name: "writing", description: "Creative writing" }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "a1",
      name: "MyBot",
      model: "llama3",
      tools: [{ name: "search", description: "Search the web" }],
      skills: [{ name: "writing", description: "Creative writing" }],
    });

    // Verify the request sent to the host included metadata
    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.payload.instructions).toBe("You are a helper");
    expect(sentMsg.payload.tools).toEqual([{ name: "search", description: "Search the web" }]);
    expect(sentMsg.payload.skills).toEqual([{ name: "writing", description: "Creative writing" }]);
    expect(sentMsg.payload).not.toHaveProperty("contextWindow");
    expect(sentMsg.payload).not.toHaveProperty("systemPrompt");
  });
});

describe("GET /api/agents/:agentId/folder-tree", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

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
    const res = await request(app).get("/api/agents/a1/folder-tree");
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("no hosts");
  });

  it("proxies list-agent-folder to host and returns tree payload", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);
    const treePayload = {
      tree: {
        id: ".",
        name: "my-alias",
        kind: "directory",
        children: [{ id: "AGENTS.md", name: "AGENTS.md", kind: "file" }],
      },
    };

    const socket = new AutoRespondingSocket();
    socket.responseData = treePayload;
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents/agent-1/folder-tree");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(treePayload);

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("list-agent-folder");
    expect(sentMsg.payload).toEqual({ agentId: "agent-1" });
  });

  it("tries next host when first returns agent not found", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "agent not found: agent-1";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = { tree: { id: ".", name: "a", kind: "directory", children: [] } };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).get("/api/agents/agent-1/folder-tree");

    expect(res.status).toBe(200);
    expect(res.body.tree.name).toBe("a");
  });
});

describe("DELETE /api/agents/:agentId", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;

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
    const res = await request(app).delete("/api/agents/some-agent");
    expect(res.status).toBe(502);
  });

  it("relays delete-agent to host and returns success", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA]);

    const socket = new AutoRespondingSocket();
    socket.responseData = { success: true };
    router.registerHost("host-a", socket);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/agents/agent-123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const sentMsg = JSON.parse(socket.sent[0]);
    expect(sentMsg.action).toBe("delete-agent");
    expect(sentMsg.payload).toEqual({ agentId: "agent-123" });
  });

  it("tries next host when first host fails", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    // hostA rejects (agent not found)
    const socketA = new AutoRespondingSocket();
    socketA.responseError = "agent not found: agent-123";
    router.registerHost("host-a", socketA);

    // hostB succeeds
    const socketB = new AutoRespondingSocket();
    socketB.responseData = { success: true };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/agents/agent-123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 502 when all hosts reject", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "agent not found: agent-123";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseError = "agent not found: agent-123";
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/agents/agent-123");

    expect(res.status).toBe(502);
  });

  it("returns 200 when at least one host succeeds (even if others fail)", async () => {
    reg.listHosts = vi.fn().mockReturnValue([hostA, hostB]);

    const socketA = new AutoRespondingSocket();
    socketA.responseError = "host-a error";
    router.registerHost("host-a", socketA);

    const socketB = new AutoRespondingSocket();
    socketB.responseData = { success: true };
    router.registerHost("host-b", socketB);

    const app = createApp(reg, undefined, router);
    const res = await request(app).delete("/api/agents/agent-123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});
