import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fanOutToAllHosts,
  fanOutToFirstHost,
  fanOutToSpecificHost,
  FanOutError,
  NoHostsError,
} from "../src/fanout.js";
import type { Registry } from "../src/registry.js";
import type { AgentRouter } from "../src/agent-router.js";
import type { HostInfo } from "../src/types.js";

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockRegistry(hosts: HostInfo[] = []): Registry {
  return {
    registerHost: vi.fn(),
    updateHeartbeat: vi.fn(),
    removeHost: vi.fn(),
    listHosts: vi.fn().mockReturnValue(hosts),
  };
}

function mockRouter(
  responses: Map<string, unknown> = new Map(),
  errors: Map<string, string> = new Map()
): AgentRouter {
  return {
    registerHost: vi.fn(),
    unregisterHost: vi.fn(),
    request: vi.fn().mockImplementation(async (hostId: string, _req: { action: string; payload: unknown }, _options?: { timeoutMs?: number }) => {
      if (errors.has(hostId)) {
        throw new Error(errors.get(hostId)!);
      }
      if (responses.has(hostId)) {
        return responses.get(hostId);
      }
      throw new Error(`host ${hostId} not found`);
    }),
    streamRequest: vi.fn(),
    abortStream: vi.fn(),
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

const hostB: HostInfo = {
  id: "host-b",
  hostname: "desktop",
  connectedAt: "",
  lastHeartbeat: "",
  ollamaVersion: "1.0",
  models: [],
  status: "online",
};

// ── fanOutToAllHosts ─────────────────────────────────────────────────────────

describe("fanOutToAllHosts", () => {
  it("returns empty array when no hosts", async () => {
    const reg = mockRegistry();
    const router = mockRouter();
    const result = await fanOutToAllHosts(reg, router, {
      action: "list-agents",
      payload: {},
      hostIdField: "hostId",
    });
    expect(result).toEqual([]);
  });

  it("aggregates results from all hosts, adding hostId to each item", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(
      new Map([
        ["host-a", [{ id: "a1", name: "Alpha" }]],
        ["host-b", [{ id: "b1", name: "Beta" }]],
      ])
    );

    const result = await fanOutToAllHosts(reg, router, {
      action: "list-agents",
      payload: {},
      hostIdField: "hostId",
    });

    expect(result).toEqual([
      { id: "a1", name: "Alpha", hostId: "host-a" },
      { id: "b1", name: "Beta", hostId: "host-b" },
    ]);
  });

  it("returns partial results when some hosts fail", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(
      new Map([["host-a", [{ id: "a1", name: "Alpha" }]]]),
      new Map([["host-b", "connection error"]])
    );

    const result = await fanOutToAllHosts(reg, router, {
      action: "list-agents",
      payload: {},
      hostIdField: "hostId",
    });

    expect(result).toEqual([{ id: "a1", name: "Alpha", hostId: "host-a" }]);
  });

  it("throws FanOutError when ALL hosts fail", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(new Map(), new Map([
      ["host-a", "timeout"],
      ["host-b", "connection error"],
    ]));

    try {
      await fanOutToAllHosts(reg, router, {
        action: "list-agents",
        payload: {},
        hostIdField: "hostId",
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FanOutError);
      expect((err as FanOutError).errors).toHaveLength(2);
    }
  });

  it("uses optional timeoutMs", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter(new Map([["host-a", [{ id: "a1" }]]]));

    const result = await fanOutToAllHosts(reg, router, {
      action: "list-agents",
      payload: {},
      hostIdField: "hostId",
      timeoutMs: 5000,
    });

    expect(router.request).toHaveBeenCalledWith(
      "host-a",
      { action: "list-agents", payload: {} },
      { timeoutMs: 5000 }
    );
  });
});

// ── fanOutToFirstHost ────────────────────────────────────────────────────────

describe("fanOutToFirstHost", () => {
  it("throws NoHostsError when no hosts connected", async () => {
    const reg = mockRegistry();
    const router = mockRouter();

    try {
      await fanOutToFirstHost(reg, router, {
        action: "send-message",
        payload: { agentId: "a1", prompt: "hi" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NoHostsError);
    }
  });

  it("returns data from the first host that succeeds", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(
      new Map([
        ["host-a", { response: "hello" }],
      ])
    );

    const result = await fanOutToFirstHost(reg, router, {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hi" },
    });

    expect(result).toEqual({ data: { response: "hello" }, hostId: "host-a" });
  });

  it("tries next host on failure and returns first success", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(
      new Map([["host-b", { response: "from B" }]]),
      new Map([["host-a", "agent not found"]])
    );

    const result = await fanOutToFirstHost(reg, router, {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hi" },
    });

    expect(result).toEqual({ data: { response: "from B" }, hostId: "host-b" });
  });

  it("throws FanOutError with all errors when every host fails", async () => {
    const reg = mockRegistry([hostA, hostB]);
    const router = mockRouter(new Map(), new Map([
      ["host-a", "agent not found"],
      ["host-b", "timeout"],
    ]));

    try {
      await fanOutToFirstHost(reg, router, {
        action: "send-message",
        payload: { agentId: "a1", prompt: "hi" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FanOutError);
      expect((err as FanOutError).errors).toHaveLength(2);
    }
  });

  it("uses optional timeoutMs", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter(new Map([["host-a", { ok: true }]]));

    await fanOutToFirstHost(reg, router, {
      action: "get-chat",
      payload: { chatId: "c1" },
      timeoutMs: 30_000,
    });

    expect(router.request).toHaveBeenCalledWith(
      "host-a",
      { action: "get-chat", payload: { chatId: "c1" } },
      { timeoutMs: 30_000 }
    );
  });
});

// ── fanOutToSpecificHost ──────────────────────────────────────────────────────

describe("fanOutToSpecificHost", () => {
  it("throws with status 404 when hostId is not found", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter();

    try {
      await fanOutToSpecificHost(reg, router, "host-b", {
        action: "create-agent",
        payload: { name: "Bot" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FanOutError);
      expect((err as FanOutError).status).toBe(404);
      expect((err as FanOutError).message).toContain("host-b");
    }
  });

  it("returns data from the specific host on success", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter(new Map([["host-a", { id: "a1", name: "Bot" }]]));

    const result = await fanOutToSpecificHost(reg, router, "host-a", {
      action: "create-agent",
      payload: { name: "Bot" },
    });

    expect(result).toEqual({ id: "a1", name: "Bot" });
  });

  it("throws FanOutError (status 400) when host rejects the request", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter(new Map(), new Map([["host-a", "missing required field: name"]]));

    try {
      await fanOutToSpecificHost(reg, router, "host-a", {
        action: "create-agent",
        payload: {},
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FanOutError);
      expect((err as FanOutError).status).toBe(400);
      expect((err as FanOutError).message).toContain("missing required field: name");
    }
  });

  it("uses optional timeoutMs", async () => {
    const reg = mockRegistry([hostA]);
    const router = mockRouter(new Map([["host-a", { ok: true }]]));

    await fanOutToSpecificHost(reg, router, "host-a", {
      action: "create-agent",
      payload: { name: "Bot" },
      timeoutMs: 10_000,
    });

    expect(router.request).toHaveBeenCalledWith(
      "host-a",
      { action: "create-agent", payload: { name: "Bot" } },
      { timeoutMs: 10_000 }
    );
  });
});