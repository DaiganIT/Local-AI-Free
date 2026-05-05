import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "../src/messageHandler.js";

describe("handleMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onRegistered with the id for a registered message", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();

    handleMessage('{"type":"registered","id":"host-abc-123"}', { onRegistered, onPing });

    expect(onRegistered).toHaveBeenCalledWith("host-abc-123");
    expect(onPing).not.toHaveBeenCalled();
  });

  it("calls onPing for a ping message", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();

    handleMessage('{"type":"ping"}', { onRegistered, onPing });

    expect(onPing).toHaveBeenCalledOnce();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it("does nothing for unknown message types", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();

    handleMessage('{"type":"unknown"}', { onRegistered, onPing });

    expect(onRegistered).not.toHaveBeenCalled();
    expect(onPing).not.toHaveBeenCalled();
  });

  it("calls onRequest with action, payload, id, and send for a request message", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();
    const onRequest = vi.fn();

    handleMessage(
      JSON.stringify({ type: "request", id: "42", action: "create-agent", payload: { name: "my-agent", model: "llama3.2" } }),
      { onRegistered, onPing, onRequest }
    );

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onRequest).toHaveBeenCalledWith({
      action: "create-agent",
      payload: { name: "my-agent", model: "llama3.2" },
      id: "42",
      send: expect.any(Function),
    });
  });

  it("exposes send helper that calls sendResponse callback", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();
    const onRequest = vi.fn();

    handleMessage(
      JSON.stringify({ type: "request", id: "7", action: "list-agents", payload: {} }),
      { onRegistered, onPing, onRequest }
    );

    const { send } = onRequest.mock.calls[0][0];
    send({ some: "data" });
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        send: expect.any(Function),
      })
    );
  });

  it("calls onAbort with the request id for an abort message", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();
    const onAbort = vi.fn();

    handleMessage(JSON.stringify({ type: "abort", id: "req-123" }), { onRegistered, onPing, onAbort });

    expect(onAbort).toHaveBeenCalledWith("req-123");
    expect(onRegistered).not.toHaveBeenCalled();
    expect(onPing).not.toHaveBeenCalled();
  });

  it("does not throw when onAbort is not provided and abort message is received", () => {
    const onRegistered = vi.fn();
    const onPing = vi.fn();

    expect(() => {
      handleMessage(JSON.stringify({ type: "abort", id: "req-456" }), { onRegistered, onPing });
    }).not.toThrow();
  });
});


