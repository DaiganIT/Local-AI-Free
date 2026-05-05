import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReconnector } from "../src/reconnector.js";

describe("createReconnector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules reconnect after the configured delay", () => {
    const onReconnect = vi.fn();
    const { onConnectionLost } = createReconnector({
      delayMs: 5000,
      onReconnect,
    });

    onConnectionLost();

    expect(onReconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4999);
    expect(onReconnect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it("can cancel a pending reconnect via stop()", () => {
    const onReconnect = vi.fn();
    const { onConnectionLost, stop } = createReconnector({
      delayMs: 5000,
      onReconnect,
    });

    onConnectionLost();
    stop();

    vi.advanceTimersByTime(5000);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("does not schedule multiple reconnects at once", () => {
    const onReconnect = vi.fn();
    const { onConnectionLost } = createReconnector({
      delayMs: 5000,
      onReconnect,
    });

    // Connection lost twice in quick succession
    onConnectionLost();
    onConnectionLost();

    vi.advanceTimersByTime(5000);
    // Should still only fire once — second call is ignored while reconnect is pending
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
