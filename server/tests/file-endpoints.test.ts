import { EventEmitter } from "events";
import request from "supertest";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../src/routes.js";
import type { Registry } from "../src/registry.js";
import type { HostInfo } from "../src/types.js";
import { createAgentRouter } from "../src/agent-router.js";
import type { AgentRouter } from "../src/agent-router.js";

function mockRegistry(hosts: HostInfo[] = []): Registry {
  return {
    registerHost: vi.fn(),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn().mockReturnValue(hosts),
  };
}

/** Fake WS socket that auto-responds to requests. */
class AutoRespondingSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1;
  responseData: unknown = {};
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
  ollamaVersion: "1.0",
  models: [],
  status: "online",
};

describe("GET /api/agents/:agentId/file", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;
  let socket: AutoRespondingSocket;

  beforeEach(() => {
    reg = mockRegistry([hostA]);
    router = createAgentRouter();
    socket = new AutoRespondingSocket();
    router.registerHost("host-a", socket as any);
  });

  afterEach(() => {
    router.destroy();
  });

  it("returns file content from the host", async () => {
    socket.responseData = { content: "Hello, world!", kind: "text", path: "notes.txt" };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/agents/agent-1/file")
      .query({ path: "notes.txt" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      content: "Hello, world!",
      kind: "text",
      path: "notes.txt",
    });
  });

  it("returns 400 when path query param is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/agents/agent-1/file");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("path");
  });

  it("returns 502 when no hosts are connected", async () => {
    reg = mockRegistry([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/agents/agent-1/file")
      .query({ path: "notes.txt" });

    expect(res.status).toBe(502);
  });

  it("forwards host error as 502", async () => {
    socket.responseError = "file not found: notes.txt";

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .get("/api/agents/agent-1/file")
      .query({ path: "notes.txt" });

    expect(res.status).toBe(502);
  });
});

describe("PUT /api/agents/:agentId/file", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let router: AgentRouter;
  let socket: AutoRespondingSocket;

  beforeEach(() => {
    reg = mockRegistry([hostA]);
    router = createAgentRouter();
    socket = new AutoRespondingSocket();
    router.registerHost("host-a", socket as any);
  });

  afterEach(() => {
    router.destroy();
  });

  it("writes a file and returns success", async () => {
    socket.responseData = { success: true, path: "notes.txt" };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/agents/agent-1/file")
      .send({ path: "notes.txt", content: "Hello, world!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("returns 400 when path is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/agents/agent-1/file")
      .send({ content: "Hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("path");
  });

  it("returns 400 when content is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/agents/agent-1/file")
      .send({ path: "notes.txt" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("content");
  });

  it("returns 502 when no hosts are connected", async () => {
    reg = mockRegistry([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/agents/agent-1/file")
      .send({ path: "notes.txt", content: "Hello" });

    expect(res.status).toBe(502);
  });

  it("forwards host error as 502", async () => {
    socket.responseError = "path not allowed";

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .put("/api/agents/agent-1/file")
      .send({ path: "../../../etc/passwd", content: "pwned" });

    expect(res.status).toBe(502);
  });
});
