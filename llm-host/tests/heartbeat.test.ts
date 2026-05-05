import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHeartbeat } from "../src/heartbeat.js";
import type { OllamaModel } from "../src/ollama.js";

const INTERVAL_MS = 10_000;

describe("createHeartbeat", () => {
  let fetchModels: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchModels = vi.fn().mockResolvedValue([
      { name: "llama3.2", size: 2019392832 },
    ]);
    send = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends a heartbeat after the first interval", async () => {
    createHeartbeat({ intervalMs: INTERVAL_MS, fetchModels, send });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(send.mock.lastCall[0]);
    expect(sent).toEqual({
      type: "heartbeat",
      models: [{ name: "llama3.2", size: 2019392832 }],
    });
  });

  it("sends heartbeat at every interval", async () => {
    createHeartbeat({ intervalMs: INTERVAL_MS, fetchModels, send });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops after stop() is called", async () => {
    const stop = createHeartbeat({ intervalMs: INTERVAL_MS, fetchModels, send });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    stop();

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("fetches fresh models on every tick", async () => {
    fetchModels.mockResolvedValueOnce([{ name: "llama3.2", size: 1 }]);
    fetchModels.mockResolvedValueOnce([
      { name: "llama3.2", size: 1 },
      { name: "phi3", size: 2 },
    ]);

    createHeartbeat({ intervalMs: INTERVAL_MS, fetchModels, send });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    const firstSent = JSON.parse(send.mock.calls[0][0]);
    const secondSent = JSON.parse(send.mock.calls[1][0]);

    expect(firstSent.models).toHaveLength(1);
    expect(secondSent.models).toHaveLength(2);
  });
});
