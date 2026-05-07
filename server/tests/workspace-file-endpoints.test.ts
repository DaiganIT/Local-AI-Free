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
  providers: [{ name: "ollama", version: "1.0" }],
  models: [],
  status: "online",
};

// ── GET /api/workspaces/:workspaceId/folder-tree ───────────────────────────

describe("GET /api/workspaces/:workspaceId/folder-tree", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when hostId query param is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/folder-tree");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 404 when host is not connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/folder-tree?hostId=host-a");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });

  it("relays list-workspace-folder to the host and returns the tree", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("list-workspace-folder");
      expect(req.payload).toMatchObject({ workspaceId: "w1" });
      return {
        tree: {
          name: "my-workspace",
          type: "directory",
          children: [
            { name: "notes.txt", type: "file" },
            { name: "src", type: "directory", children: [] },
          ],
        },
      };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/folder-tree?hostId=host-a");

    expect(res.status).toBe(200);
    expect(res.body.tree.name).toBe("my-workspace");
    expect(res.body.tree.children).toHaveLength(2);
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("workspace not found: w1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app).get("/api/workspaces/w1/folder-tree?hostId=host-a");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── GET /api/workspaces/:workspaceId/file ──────────────────────────────────

describe("GET /api/workspaces/:workspaceId/file", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when hostId query param is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .get("/api/workspaces/w1/file")
      .query({ path: "notes.txt" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 400 when path query param is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .get("/api/workspaces/w1/file")
      .query({ hostId: "host-a" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("path");
  });

  it("returns 404 when host is not connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .get("/api/workspaces/w1/file")
      .query({ hostId: "host-a", path: "notes.txt" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });

  it("relays read-workspace-file to the host and returns file content", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("read-workspace-file");
      expect(req.payload).toMatchObject({ workspaceId: "w1", path: "notes.txt" });
      return { content: "Hello, workspace!", kind: "text", path: "notes.txt" };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .get("/api/workspaces/w1/file")
      .query({ hostId: "host-a", path: "notes.txt" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      content: "Hello, workspace!",
      kind: "text",
      path: "notes.txt",
    });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("workspace not found: w1");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .get("/api/workspaces/w1/file")
      .query({ hostId: "host-a", path: "notes.txt" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ── PUT /api/workspaces/:workspaceId/file ──────────────────────────────────

describe("PUT /api/workspaces/:workspaceId/file", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let ar: ReturnType<typeof mockAgentRouter>;

  beforeEach(() => {
    reg = mockRegistry();
    ar = mockAgentRouter();
  });

  it("returns 400 when hostId is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ path: "notes.txt", content: "Hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("hostId");
  });

  it("returns 400 when path is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ hostId: "host-a", content: "Hello" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("path");
  });

  it("returns 400 when content is missing", async () => {
    reg.setHosts([hostA]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ hostId: "host-a", path: "notes.txt" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("content");
  });

  it("returns 404 when host is not connected", async () => {
    reg.setHosts([]);
    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ hostId: "host-a", path: "notes.txt", content: "Hello" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("host");
  });

  it("relays write-workspace-file to the host and returns success", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async (_hostId: string, req: { action: string; payload: unknown }) => {
      expect(req.action).toBe("write-workspace-file");
      expect(req.payload).toMatchObject({
        workspaceId: "w1",
        path: "notes.txt",
        content: "Hello, workspace!",
      });
      return { success: true, path: "notes.txt" };
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ hostId: "host-a", path: "notes.txt", content: "Hello, workspace!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("returns 400 when the host rejects the request", async () => {
    reg.setHosts([hostA]);
    ar.setHandler(async () => {
      throw new Error("path traversal detected");
    });

    const app = createApp(reg, undefined, ar);
    const res = await request(app)
      .put("/api/workspaces/w1/file")
      .send({ hostId: "host-a", path: "../../../etc/passwd", content: "pwned" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("traversal");
  });
});
