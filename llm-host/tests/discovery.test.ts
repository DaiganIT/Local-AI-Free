import { describe, it, expect, vi, afterEach } from "vitest";
import { autoDiscoverProviders, fetchAllModels } from "../src/providers/discovery.js";
import type { ModelProvider, ModelInfo } from "../src/providers/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("autoDiscoverProviders", () => {
  it("returns only reachable providers", async () => {
    // Mock Ollama as reachable, MLX as unreachable, Omlx as reachable
    const fetchMock = vi.spyOn(global, "fetch");

    // ollama: reachable
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.5.0" }), { status: 200 }),
    );
    // mlx: unreachable (connection refused)
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    // omlx: reachable
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "healthy" }), { status: 200 }),
    );

    const { providers, meta } = await autoDiscoverProviders();

    expect(providers.map((p) => p.name)).toEqual(["ollama", "omlx"]);
    expect(meta).toEqual([
      { name: "ollama", version: "0.5.0" },
      { name: "omlx", version: "omlx" },
    ]);
  });

  it("returns empty when no providers are reachable", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("all dead"));

    const { providers, meta } = await autoDiscoverProviders();

    expect(providers).toEqual([]);
    expect(meta).toEqual([]);
  });

  it("handles providers that throw during version check", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    // All three throw
    fetchMock.mockRejectedValue(new Error("network error"));

    const { providers, meta } = await autoDiscoverProviders();

    expect(providers).toEqual([]);
    expect(meta).toEqual([]);
  });
});

describe("fetchAllModels", () => {
  it("aggregates models from all providers", async () => {
    const mockOllama: ModelProvider = {
      name: "ollama",
      version: vi.fn().mockResolvedValue({ version: "0.3.5", reachable: true }),
      models: vi.fn().mockResolvedValue([
        { name: "llama3.2", size: 2019392832, provider: "ollama" },
        { name: "phi3", size: 1929381837, provider: "ollama" },
      ]),
    };

    const mockMlx: ModelProvider = {
      name: "mlx",
      version: vi.fn().mockResolvedValue({ version: "mlx-omni-server", reachable: true }),
      models: vi.fn().mockResolvedValue([
        { name: "qwen2.5", size: 0, provider: "mlx" },
      ]),
    };

    const models = await fetchAllModels([mockOllama, mockMlx]);
    expect(models).toEqual([
      { name: "llama3.2", size: 2019392832, provider: "ollama" },
      { name: "phi3", size: 1929381837, provider: "ollama" },
      { name: "qwen2.5", size: 0, provider: "mlx" },
    ]);
  });

  it("skips unreachable providers", async () => {
    const mockOllama: ModelProvider = {
      name: "ollama",
      version: vi.fn().mockResolvedValue({ version: "unknown", reachable: false }),
      models: vi.fn().mockResolvedValue([]),
    };

    const mockMlx: ModelProvider = {
      name: "mlx",
      version: vi.fn().mockResolvedValue({ version: "mlx-omni-server", reachable: true }),
      models: vi.fn().mockResolvedValue([
        { name: "qwen2.5", size: 0, provider: "mlx" },
      ]),
    };

    const models = await fetchAllModels([mockOllama, mockMlx]);
    expect(models).toEqual([
      { name: "qwen2.5", size: 0, provider: "mlx" },
    ]);
  });

  it("handles providers that throw", async () => {
    const badProvider: ModelProvider = {
      name: "broken",
      version: vi.fn().mockRejectedValue(new Error("boom")),
      models: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const goodProvider: ModelProvider = {
      name: "ok",
      version: vi.fn().mockResolvedValue({ version: "1.0", reachable: true }),
      models: vi.fn().mockResolvedValue([{ name: "test", size: 0, provider: "ok" }]),
    };

    const models = await fetchAllModels([badProvider, goodProvider]);
    expect(models).toEqual([{ name: "test", size: 0, provider: "ok" }]);
  });
});
