import { EventEmitter } from "events";
import path from "path";
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
  providers: [{ name: "ollama", version: "1.0" }],
  models: [],
  status: "online",
};

// ── POST /api/agents/:agentId/uploads ────────────────────────────────────

describe("POST /api/agents/:agentId/uploads", () => {
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

  it("uploads a file and returns { path, name, size }", async () => {
    socket.responseData = { path: "uploads/notes.txt", name: "notes.txt", size: 12 };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello world!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      path: "uploads/notes.txt",
      name: "notes.txt",
      size: 12,
    });
  });

  it("sends upload-agent-file action to the host", async () => {
    socket.responseData = { path: "uploads/notes.txt", name: "notes.txt", size: 12 };

    const app = createApp(reg, undefined, router);
    await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello world!" });

    const sent = JSON.parse(socket.sent[0]);
    expect(sent.action).toBe("upload-agent-file");
    expect(sent.payload).toMatchObject({
      agentId: "agent-1",
      fileName: "notes.txt",
      content: "Hello world!",
    });
  });

  it("returns 400 when fileName is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ content: "Hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("fileName");
  });

  it("returns 400 when content is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ fileName: "notes.txt" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("content");
  });

  it("returns 502 when no hosts are connected", async () => {
    reg = mockRegistry([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello" });

    expect(res.status).toBe(502);
  });

  it("returns 502 when host returns an error", async () => {
    socket.responseError = "agent not found: agent-1";

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello" });

    expect(res.status).toBe(502);
  });
});

// ── POST /api/workspaces/:workspaceId/uploads ────────────────────────────

describe("POST /api/workspaces/:workspaceId/uploads", () => {
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

  it("uploads a file and returns { path, name, size }", async () => {
    socket.responseData = { path: "uploads/notes.txt", name: "notes.txt", size: 12 };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello world!", hostId: "host-a" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      path: "uploads/notes.txt",
      name: "notes.txt",
      size: 12,
    });
  });

  it("sends upload-workspace-file action to the host", async () => {
    socket.responseData = { path: "uploads/notes.txt", name: "notes.txt", size: 12 };

    const app = createApp(reg, undefined, router);
    await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello world!", hostId: "host-a" });

    const sent = JSON.parse(socket.sent[0]);
    expect(sent.action).toBe("upload-workspace-file");
    expect(sent.payload).toMatchObject({
      workspaceId: "ws-1",
      fileName: "notes.txt",
      content: "Hello world!",
    });
  });

  it("returns 400 when hostId is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 400 when fileName is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ content: "Hello", hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("fileName");
  });

  it("returns 400 when content is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("content");
  });

  it("returns 404 when hostId is not connected", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello", hostId: "host-unknown" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });

  it("returns 400 when host returns an error", async () => {
    socket.responseError = "workspace not found: ws-1";

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .send({ fileName: "notes.txt", content: "Hello", hostId: "host-a" });

    expect(res.status).toBe(400);
  });
});

// ── POST /api/agents/:agentId/uploads (multipart/form-data) ────────────────

describe("POST /api/agents/:agentId/uploads (multipart)", () => {
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

  it("accepts multipart file upload and forwards base64 + mimeType", async () => {
    socket.responseData = { path: "uploads/photo.png", name: "photo.png", size: 4 };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "photo.png");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      path: "uploads/photo.png",
      name: "photo.png",
      size: 4,
    });

    // Verify the WS payload has base64 content + mimeType
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.action).toBe("upload-agent-file");
    expect(sent.payload.fileName).toBe("photo.png");
    expect(sent.payload.content).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
    expect(sent.payload.mimeType).toBe("image/png");
  });

  it("returns 400 when no file is attached", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .field("fileName", "notes.txt");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("file");
  });

  it("returns 502 when no hosts are connected", async () => {
    reg = mockRegistry([]);
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/agents/agent-1/uploads")
      .attach("file", Buffer.from("hello"), "notes.txt");

    expect(res.status).toBe(502);
  });
});

// ── POST /api/workspaces/:workspaceId/uploads (multipart/form-data) ──────

describe("POST /api/workspaces/:workspaceId/uploads (multipart)", () => {
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

  it("accepts multipart file upload with hostId field and forwards base64 + mimeType", async () => {
    socket.responseData = { path: "uploads/photo.png", name: "photo.png", size: 4 };

    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .field("hostId", "host-a")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "photo.png");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      path: "uploads/photo.png",
      name: "photo.png",
      size: 4,
    });

    // Verify the WS payload
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.action).toBe("upload-workspace-file");
    expect(sent.payload.workspaceId).toBe("ws-1");
    expect(sent.payload.fileName).toBe("photo.png");
    expect(sent.payload.content).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
    expect(sent.payload.mimeType).toBe("image/png");
  });

  it("returns 400 when no file is attached", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .field("hostId", "host-a");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("file");
  });

  it("returns 400 when hostId is missing", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .attach("file", Buffer.from("hello"), "notes.txt");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when hostId is not connected", async () => {
    const app = createApp(reg, undefined, router);
    const res = await request(app)
      .post("/api/workspaces/ws-1/uploads")
      .field("hostId", "host-unknown")
      .attach("file", Buffer.from("hello"), "notes.txt");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });
});
