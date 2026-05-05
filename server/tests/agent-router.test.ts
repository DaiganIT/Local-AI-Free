import { EventEmitter } from "events";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAgentRouter } from "../src/agent-router.js";

// Fake WebSocket — just an EventEmitter with send() and close()
class FakeWsSocket extends EventEmitter {
  readyState = 1; // OPEN
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() {}
}

describe("agent-router", () => {
  let router: ReturnType<typeof createAgentRouter>;
  let socket: FakeWsSocket;

  beforeEach(() => {
    router = createAgentRouter();
    socket = new FakeWsSocket();
  });

  afterEach(() => {
    router.destroy();
  });

  it("registerHost makes the socket available for requests", async () => {
    router.registerHost("host-1", socket);
    const p = router.request("host-1", { action: "list-agents", payload: {} });
    // Verifies the socket is wired up and doesn't throw
    expect(socket.sent).toHaveLength(1);

    // Clean up the pending request so afterEach destroy doesn't leak
    const sent = JSON.parse(socket.sent[0]);
    socket.emit("message", JSON.stringify({ type: "response", id: sent.id, data: [] }));
    await p;
  });

  it("throws when requesting from an unknown host", async () => {
    await expect(
      router.request("unknown", { action: "list-agents", payload: {} })
    ).rejects.toThrow("host unknown not found");
  });

  it("sends a request message and resolves when host responds", async () => {
    router.registerHost("host-1", socket);

    const promise = router.request("host-1", {
      action: "list-agents",
      payload: {},
    });

    // Host responds (simulate by parsing the sent request)
    const sent = JSON.parse(socket.sent[0]);
    const response = JSON.stringify({ type: "response", id: sent.id, data: [{ id: "a1", name: "Bot" }] });
    socket.emit("message", response);

    const result = await promise;
    expect(result).toEqual([{ id: "a1", name: "Bot" }]);
  });

  it("rejects when host returns an error", async () => {
    router.registerHost("host-1", socket);

    const promise = router.request("host-1", {
      action: "get-agent",
      payload: { id: "a1" },
    });

    const sent = JSON.parse(socket.sent[0]);
    const response = JSON.stringify({ type: "response", id: sent.id, error: "Agent not found" });
    socket.emit("message", response);

    await expect(promise).rejects.toThrow("Agent not found");
  });

  it("rejects on timeout", async () => {
    router.registerHost("host-1", socket);

    await expect(
      router.request("host-1", { action: "list-agents", payload: {} }, { timeoutMs: 30 })
    ).rejects.toThrow("host-1 request timed out");
  });

  it("clears socket listeners when host disconnects", () => {
    router.registerHost("host-1", socket);
    router.unregisterHost("host-1");

    // Sending a message now shouldn't resolve any outstanding promise
    // (no listeners attached anymore)
    expect(socket.listenerCount("message")).toBe(0);
  });

  it("rejects all pending requests when a host disconnects", async () => {
    router.registerHost("host-1", socket);

    const promise = router.request("host-1", {
      action: "list-agents",
      payload: {},
    });

    router.unregisterHost("host-1");

    await expect(promise).rejects.toThrow("host disconnected");
  });

  it("rejects all pending requests when router is destroyed", async () => {
    router.registerHost("host-1", socket);

    const promise = router.request("host-1", {
      action: "list-agents",
      payload: {},
    });

    router.destroy();

    await expect(promise).rejects.toThrow("router destroyed");
  });

  it("only rejects requests for the disconnected host (not others)", async () => {
    const socket1 = new FakeWsSocket();
    const socket2 = new FakeWsSocket();
    router.registerHost("host-1", socket1);
    router.registerHost("host-2", socket2);

    const promise1 = router.request("host-1", { action: "list-agents", payload: {} });
    const promise2 = router.request("host-2", { action: "list-agents", payload: {} });

    router.unregisterHost("host-1");

    await expect(promise1).rejects.toThrow("host disconnected");

    // host-2 request should still work
    const sent = JSON.parse(socket2.sent[0]);
    socket2.emit("message", JSON.stringify({ type: "response", id: sent.id, data: [{ id: "x" }] }));
    expect(await promise2).toEqual([{ id: "x" }]);
  });
});
