import type { ModelProvider, ModelInfo } from "./types.js";
import { OllamaProvider } from "./ollama-discovery.js";
import { MlxProvider } from "./mlx-discovery.js";

/**
 * Create provider instances for the given provider names.
 * Defaults to ["ollama"] if the list is empty.
 */
export function collectProviders(providerNames: string[]): ModelProvider[] {
  if (providerNames.length === 0) {
    providerNames = ["ollama"];
  }

  const providers: ModelProvider[] = [];
  for (const name of providerNames) {
    switch (name) {
      case "ollama":
        providers.push(new OllamaProvider());
        break;
      case "mlx":
        providers.push(new MlxProvider());
        break;
      default:
        console.warn(`[discovery] Unknown provider: "${name}" — skipping`);
    }
  }
  return providers;
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

/**
 * Build the providers metadata list by checking each provider's version.
 */
export async function discoverProviders(providers: ModelProvider[]): Promise<{ name: string; version: string }[]> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      const { version, reachable } = await provider.version();
      return { name: provider.name, version: reachable ? version : "unreachable" };
    }),
  );
  return results;
}
