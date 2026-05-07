import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/routes.js";
import type { Registry } from "../src/registry.js";
import type { HostInfo } from "../src/types.js";

// ── Mock registry ────────────────────────────────────────────────────────────
function mockRegistry(): Registry {
  return {
    registerHost: vi.fn(),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn().mockReturnValue([] as HostInfo[]),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("routes", () => {
  let reg: ReturnType<typeof mockRegistry>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    reg = mockRegistry();
    app = createApp(reg);
  });

  it("returns ok true and a timestamp", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ts).toBe("string");
  });

  it("delegates to registry.listHosts", async () => {
    const hosts: HostInfo[] = [
      {
        id: "abc123",
        hostname: "my-pc",
        connectedAt: "",
        lastHeartbeat: "",
        providers: [{ name: "ollama", version: "1.0" }],
        models: [],
        status: "online",
      },
    ];
    reg.listHosts.mockReturnValue(hosts);

    const res = await request(app).get("/hosts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(hosts);
    expect(reg.listHosts).toHaveBeenCalledTimes(1);
  });

  it("returns [] when registry is empty", async () => {
    reg.listHosts.mockReturnValue([]);
    const res = await request(app).get("/hosts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("auth middleware", () => {
  let reg: ReturnType<typeof mockRegistry>;

  const VALID_KEY = "secret-abc";
  const VALID_KEYS = new Set([VALID_KEY]);

  beforeEach(() => {
    reg = mockRegistry();
  });

  it("GET /health is always public", async () => {
    const app = createApp(reg, { allowedKeys: VALID_KEYS });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("GET /hosts returns 401 when no api key is provided", async () => {
    const app = createApp(reg, { allowedKeys: VALID_KEYS });
    const res = await request(app).get("/hosts");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("GET /hosts returns 403 when api key is invalid", async () => {
    const app = createApp(reg, { allowedKeys: VALID_KEYS });
    const res = await request(app).get("/hosts").set("X-API-Key", "wrong-key");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("GET /hosts returns 200 when api key is valid", async () => {
    reg.listHosts.mockReturnValue([]);
    const app = createApp(reg, { allowedKeys: VALID_KEYS });
    const res = await request(app).get("/hosts").set("X-API-Key", VALID_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
