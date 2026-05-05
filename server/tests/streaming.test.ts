import { EventEmitter } from "events";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAgentRouter, type AgentRouter } from "../src/agent-router.js";

// Fake WebSocket — just an EventEmitter with send() and close()
class FakeWsSocket extends EventEmitter {
  readyState = 1; // OPEN
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() {}
}

describe("agent-router streamRequest", () => {
  let router: ReturnType<typeof createAgentRouter>;
  let socket: FakeWsSocket;

  beforeEach(() => {
    router = createAgentRouter();
    socket = new FakeWsSocket();
  });

  afterEach(() => {
    router.destroy();
  });

  it("throws when requesting from an unknown host", async () => {
    await expect(
      router.streamRequest!("unknown", { action: "send-message", payload: {} })
    ).rejects.toThrow("host unknown not found");
  });

  it("sends a request message and returns events async iterable + result promise", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    // Request was sent on the socket
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.type).toBe("request");
    expect(sent.action).toBe("send-message");

    // Emit stream events
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } },
    }));
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " world" } },
    }));

    // Emit final response
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent.id,
      data: { response: "Hello world", chatId: "c1" },
    }));

    // Collect events from async iterable
    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }

    expect(collected).toHaveLength(2);
    expect((collected[0] as any).event.type).toBe("message_update");
    expect((collected[1] as any).event.assistantMessageEvent.delta).toBe(" world");

    // Result promise resolves with the final data
    const finalResult = await result;
    expect(finalResult).toEqual({ response: "Hello world", chatId: "c1" });
  });

  it("works with no stream events (just a final response)", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    const sent = JSON.parse(socket.sent[0]);

    // Only a final response, no stream events
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent.id,
      data: "Direct response",
    }));

    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }
    expect(collected).toHaveLength(0);

    const finalResult = await result;
    expect(finalResult).toBe("Direct response");
  });

  it("rejects result when host returns an error response", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    const sent = JSON.parse(socket.sent[0]);

    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent.id,
      error: "agent not found",
    }));

    // Events iterable ends
    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }
    expect(collected).toHaveLength(0);

    await expect(result).rejects.toThrow("agent not found");
  });

  it("rejects on timeout", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!(
      "host-1",
      { action: "send-message", payload: {} },
      { timeoutMs: 30 }
    );

    await expect(result).rejects.toThrow("host-1 request timed out");

    // Events iterable should also end
    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }
    expect(collected).toHaveLength(0);
  });

  it("rejects stream events when host disconnects mid-stream", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    const sent = JSON.parse(socket.sent[0]);

    // Emit one stream event
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hel" } },
    }));

    // Host disconnects
    router.unregisterHost("host-1");

    // Collecting events should end after the disconnect
    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }
    expect(collected).toHaveLength(1);

    await expect(result).rejects.toThrow("host disconnected");
  });

  it("cleans up stream listener when response arrives", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: {},
    });

    const sent = JSON.parse(socket.sent[0]);

    // Send a stream event + final response
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hi" } },
    }));
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent.id,
      data: "done",
    }));

    // Consume events + result
    for await (const _ of events) { /* drain */ }
    await result;

    // After completion, a new non-stream request should still work
    // (no stale listener interference)
    const promise2 = router.request("host-1", { action: "ping", payload: {} });
    const sent2 = JSON.parse(socket.sent[1]);
    socket.emit("message", JSON.stringify({ type: "response", id: sent2.id, data: "pong" }));
    const r2 = await promise2;
    expect(r2).toBe("pong");
  });

  it("correctly yields events that arrive with delays between them", async () => {
    router.registerHost("host-1", socket);

    const { events, result } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    const sent = JSON.parse(socket.sent[0]);

    // Emit first stream event
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } },
    }));

    // Small delay before next event — this exposes the notifyWait bug
    await new Promise((r) => setTimeout(r, 10));

    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " world" } },
    }));

    await new Promise((r) => setTimeout(r, 10));

    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "!" } },
    }));

    await new Promise((r) => setTimeout(r, 10));

    // Final response
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent.id,
      data: { response: "Hello world!" },
    }));

    // Collect events
    const collected: unknown[] = [];
    for await (const event of events) {
      expect(event).toBeDefined();
      expect((event as any).event).toBeDefined();
      collected.push(event);
    }

    expect(collected).toHaveLength(3);
    expect((collected[0] as any).event.assistantMessageEvent.delta).toBe("Hello");
    expect((collected[1] as any).event.assistantMessageEvent.delta).toBe(" world");
    expect((collected[2] as any).event.assistantMessageEvent.delta).toBe("!");

    const finalResult = await result;
    expect(finalResult).toEqual({ response: "Hello world!" });
  });

  it("streamRequest returns requestId in StreamResult", async () => {
    router.registerHost("host-1", socket);

    const streamResult = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    expect(streamResult.requestId).toBeDefined();
    expect(typeof streamResult.requestId).toBe("string");

    // The requestId should match the id sent on the socket
    const sent = JSON.parse(socket.sent[0]);
    expect(streamResult.requestId).toBe(sent.id);
  });

  it("abortStream sends abort message to host and ends events iterable", async () => {
    router.registerHost("host-1", socket);

    const { events, result, requestId } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    // Emit one stream event first
    const sent = JSON.parse(socket.sent[0]);
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hel" } },
    }));

    // Abort the stream
    router.abortStream!(requestId);

    // Verify abort message was sent to the host
    const abortMsg = JSON.parse(socket.sent[1]);
    expect(abortMsg.type).toBe("abort");
    expect(abortMsg.id).toBe(requestId);

    // Events iterable should end
    const collected: unknown[] = [];
    for await (const event of events) {
      collected.push(event);
    }
    expect(collected).toHaveLength(1); // only the event before abort

    // Result promise should reject
    await expect(result).rejects.toThrow("aborted");
  });

  it("abortStream is a no-op for unknown requestId", () => {
    router.registerHost("host-1", socket);
    // Should not throw
    router.abortStream!("nonexistent-id");
    // No abort message sent
    expect(socket.sent).toHaveLength(0);
  });

  it("abortStream is a no-op for already-completed request", async () => {
    router.registerHost("host-1", socket);

    const { events, result, requestId } = await router.streamRequest!("host-1", {
      action: "send-message",
      payload: {},
    });

    const sent = JSON.parse(socket.sent[0]);

    // Complete the request normally
    socket.emit("message", JSON.stringify({ type: "response", id: sent.id, data: "done" }));

    // Drain events and result
    for await (const _ of events) { /* drain */ }
    await result;

    // Now abort — should be a no-op since request is already done
    router.abortStream!(requestId);

    // Only the original request message was sent, no abort
    expect(socket.sent).toHaveLength(1);
  });

  it("does not interfere with regular request() for non-stream messages", async () => {
    router.registerHost("host-1", socket);

    // Start a stream request
    const streamPromise = router.streamRequest!("host-1", {
      action: "send-message",
      payload: { agentId: "a1", prompt: "hello" },
    });

    const { events, result } = await streamPromise;
    const sent1 = JSON.parse(socket.sent[0]);

    // Also start a regular request (different id)
    const regularPromise = router.request("host-1", { action: "list-agents", payload: {} });
    const sent2 = JSON.parse(socket.sent[1]);

    // Stream events go to the stream listener
    socket.emit("message", JSON.stringify({
      type: "stream",
      id: sent1.id,
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hi" } },
    }));

    // Regular response goes to the regular request
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent2.id,
      data: [{ id: "agent-x" }],
    }));

    const regularResult = await regularPromise;
    expect(regularResult).toEqual([{ id: "agent-x" }]);

    // Stream still works
    socket.emit("message", JSON.stringify({
      type: "response",
      id: sent1.id,
      data: "stream done",
    }));

    for await (const _ of events) { /* drain */ }
    const streamResult = await result;
    expect(streamResult).toBe("stream done");
  });
});
