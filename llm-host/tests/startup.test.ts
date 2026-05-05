import { describe, it, expect, vi } from "vitest";
import { createStartup } from "../src/startup.js";
import type { RunningAgent } from "../src/agent-supervisor.js";

function mockSupervisor(loadFn: () => void = () => {}) {
  return {
    loadAgents: vi.fn(loadFn),
    startAgent: vi.fn(),
    stopAgent: vi.fn(),
    listRunningAgents: vi.fn((): RunningAgent[] => []),
  };
}

describe("startup", () => {
  it("calls loadAgents before connecting", async () => {
    const callOrder: string[] = [];
    const supervisor = mockSupervisor(() => {
      callOrder.push("loadAgents");
    });

    const connect = vi.fn(async () => {
      callOrder.push("connect");
    });

    createStartup({ supervisor, connect });

    // Wait for async connect to settle
    await Promise.resolve();
    expect(callOrder).toEqual(["loadAgents", "connect"]);
  });

  it("calls loadAgents exactly once", () => {
    const supervisor = mockSupervisor();
    const connect = vi.fn(async () => {});

    createStartup({ supervisor, connect });

    expect(supervisor.loadAgents).toHaveBeenCalledOnce();
  });

  it("still connects even when loadAgents throws", () => {
    const supervisor = mockSupervisor(() => {
      throw new Error("db broken");
    });
    const connect = vi.fn(async () => {});

    // Should not throw — connect must still happen
    expect(() => createStartup({ supervisor, connect })).not.toThrow();
    expect(connect).toHaveBeenCalled();
  });

  it("connects when there are no agents", () => {
    const supervisor = mockSupervisor();
    const connect = vi.fn(async () => {});

    createStartup({ supervisor, connect });

    expect(connect).toHaveBeenCalled();
    expect(supervisor.loadAgents).toHaveBeenCalled();
  });

  it("calls onFatalError when connect rejects", async () => {
    const supervisor = mockSupervisor();
    const fatalErr = new Error("connection refused");
    const connect = vi.fn(async () => {
      throw fatalErr;
    });
    const onFatalError = vi.fn();

    createStartup({ supervisor, connect, onFatalError });

    // Wait for the async rejection to propagate
    await Promise.resolve();
    expect(onFatalError).toHaveBeenCalledWith(fatalErr);
  });
});
