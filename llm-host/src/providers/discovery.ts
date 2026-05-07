import type { ModelProvider, ModelInfo } from "./types.js";
import { OllamaProvider } from "./ollama-discovery.js";
import { MlxProvider } from "./mlx-discovery.js";
import { OmlxProvider } from "./omlx-discovery.js";
import { LmStudioProvider } from "./lm-studio-discovery.js";

/**
 * Auto-discover all known providers by checking reachability.
 * Only reachable providers with their version metadata are returned.
 */
export async function autoDiscoverProviders(): Promise<{
  providers: ModelProvider[];
  meta: { name: string; version: string }[];
}> {
  const all: ModelProvider[] = [
    new OllamaProvider(),
    new MlxProvider(),
    new OmlxProvider(),
    new LmStudioProvider(),
  ];

  const results = await Promise.all(
    all.map(async (provider) => {
      try {
        const { version, reachable } = await provider.version();
        return { provider, reachable, version };
      } catch {
        console.warn(`[discovery] Provider "${provider.name}" threw during version check`);
        return { provider, reachable: false, version: "unknown" };
      }
    }),
  );

  const reachable = results.filter((r) => r.reachable);

  return {
    providers: reachable.map((r) => r.provider),
    meta: reachable.map((r) => ({ name: r.provider.name, version: r.version })),
  };
}

/**
 * Fetch models from all providers in parallel.
 * Providers that are unreachable return empty arrays and don't crash.
 */
export async function fetchAllModels(providers: ModelProvider[]): Promise<ModelInfo[]> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const models = await provider.models();
        return models;
      } catch {
        console.warn(`[discovery] Provider "${provider.name}" threw — returning 0 models`);
        return [];
      }
    }),
  );
  return results.flat();
}
