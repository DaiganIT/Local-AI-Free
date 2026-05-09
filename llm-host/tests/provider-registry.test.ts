import { describe, it, expect, beforeEach } from "vitest";
import {
  initProviderRegistry,
  findProviderForModel,
} from "../src/providers/provider-registry.js";
import type { ModelProvider, ModelInfo } from "../src/providers/types.js";

/** Reset the singleton state before each test. */
beforeEach(() => {
  initProviderRegistry([], []);
});

function makeMockProvider(options: {
  name: string;
  baseUrl: string;
  modelNames?: string[];
}): ModelProvider {
  return {
    name: options.name,
    baseUrl: options.baseUrl,
    version: async () => ({ version: "test", reachable: true }),
    models: async (): Promise<ModelInfo[]> =>
      (options.modelNames ?? []).map((name) => ({
        name,
        size: 0,
        provider: options.name,
      })),
  };
}

describe("initProviderRegistry", () => {
  it("stores providers and models for lookup", () => {
    const providers = [
      makeMockProvider({
        name: "ollama",
        baseUrl: "http://localhost:11434",
        modelNames: ["llama3.2"],
      }),
    ];
    const models: ModelInfo[] = [
      { name: "llama3.2", size: 2_000_000, provider: "ollama" },
    ];

    initProviderRegistry(providers, models);

    const result = findProviderForModel("llama3.2");
    expect(result).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
  });

  it("handles empty providers and models", () => {
    initProviderRegistry([], []);
    expect(findProviderForModel("any-model")).toBeUndefined();
  });
});

describe("findProviderForModel", () => {
  it("finds model in ollama provider", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "ollama",
          baseUrl: "http://localhost:11434",
          modelNames: ["qwen3:8b", "llama3.2"],
        }),
      ],
      [
        { name: "qwen3:8b", size: 0, provider: "ollama" },
        { name: "llama3.2", size: 0, provider: "ollama" },
      ],
    );

    expect(findProviderForModel("qwen3:8b")).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
    expect(findProviderForModel("llama3.2")).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
  });

  it("finds model in mlx provider", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "mlx",
          baseUrl: "http://localhost:11435",
          modelNames: ["qwen2.5"],
        }),
      ],
      [{ name: "qwen2.5", size: 0, provider: "mlx" }],
    );

    expect(findProviderForModel("qwen2.5")).toEqual({
      provider: "mlx",
      baseUrl: "http://localhost:11435",
    });
  });

  it("finds model in omlx provider", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "omlx",
          baseUrl: "http://localhost:8000",
          modelNames: ["llama-3.1"],
        }),
      ],
      [{ name: "llama-3.1", size: 0, provider: "omlx" }],
    );

    expect(findProviderForModel("llama-3.1")).toEqual({
      provider: "omlx",
      baseUrl: "http://localhost:8000",
    });
  });

  it("finds model in lm-studio provider", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "lm-studio",
          baseUrl: "http://localhost:1234/api",
          modelNames: ["phi4"],
        }),
      ],
      [{ name: "phi4", size: 0, provider: "lm-studio" }],
    );

    expect(findProviderForModel("phi4")).toEqual({
      provider: "lm-studio",
      baseUrl: "http://localhost:1234/api",
    });
  });

  it("handles multiple providers with different models", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "ollama",
          baseUrl: "http://localhost:11434",
          modelNames: ["qwen3:8b"],
        }),
        makeMockProvider({
          name: "mlx",
          baseUrl: "http://localhost:11435",
          modelNames: ["mlx-Qwen3-35B"],
        }),
      ],
      [
        { name: "qwen3:8b", size: 0, provider: "ollama" },
        { name: "mlx-Qwen3-35B", size: 0, provider: "mlx" },
      ],
    );

    expect(findProviderForModel("qwen3:8b")).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
    });
    expect(findProviderForModel("mlx-Qwen3-35B")).toEqual({
      provider: "mlx",
      baseUrl: "http://localhost:11435",
    });
  });

  it("returns undefined for unknown model name", () => {
    initProviderRegistry(
      [
        makeMockProvider({
          name: "ollama",
          baseUrl: "http://localhost:11434",
          modelNames: ["llama3.2"],
        }),
      ],
      [{ name: "llama3.2", size: 0, provider: "ollama" }],
    );

    expect(findProviderForModel("unknown-model")).toBeUndefined();
  });

  it("returns undefined when provider is no longer reachable", () => {
    // Model says it belongs to "mlx" but mlx is not in the provider list
    const models: ModelInfo[] = [
      { name: "ghost-model", size: 0, provider: "mlx" },
    ];

    initProviderRegistry([], models);

    expect(findProviderForModel("ghost-model")).toBeUndefined();
  });
});
