import { describe, it, expect, vi } from "vitest";
import { collectProviders, fetchAllModels } from "../src/providers/discovery.js";
import type { ModelProvider, ModelInfo } from "../src/providers/types.js";
import { OllamaProvider } from "../src/providers/ollama-discovery.js";
import { MlxProvider } from "../src/providers/mlx-discovery.js";

describe("collectProviders", () => {
  it("creates OllamaProvider when 'ollama' is in the list", () => {
    const providers = collectProviders(["ollama"]);
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("ollama");
  });

  it("creates MlxProvider when 'mlx' is in the list", () => {
    const providers = collectProviders(["mlx"]);
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("mlx");
  });

  it("creates multiple providers", () => {
    const providers = collectProviders(["ollama", "mlx"]);
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.name)).toEqual(["ollama", "mlx"]);
  });

  it("defaults to ['ollama'] when env var is empty-like", () => {
    const providers = collectProviders([]);
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("ollama");
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
});
