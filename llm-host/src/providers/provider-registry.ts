/**
 * Provider registry — maps model names to their owning provider and base URL.
 *
 * At startup (in `index.ts`), after `autoDiscoverProviders()` + `fetchAllModels()`
 * return, the registry is initialised with the discovered providers and models.
 *
 * `findProviderForModel(modelName)` matches the model name against the cached
 * model list, returns the owning provider's name and API base URL.
 *
 * This enables the agent runner to route messages to the correct provider
 * without needing to know provider-specific logic at routing time.
 */
import type { ModelProvider, ModelInfo } from "./types.js";

/** Lookup result for a model name. */
export interface ProviderLookup {
  /** Provider name (e.g. "ollama", "mlx", "omlx", "lm-studio"). */
  provider: string;
  /** Base URL of the provider's API (e.g. "http://localhost:11434"). */
  baseUrl: string;
}

/** Cached provider list (authoritative — reset on reconnect). */
let cachedProviders: ModelProvider[] = [];

/** Cached model list (authoritative — reset on reconnect). */
let cachedModels: ModelInfo[] = [];

/**
 * Initialise the registry with discovered providers and models.
 * Must be called at startup after discovery completes.
 */
export function initProviderRegistry(
  providers: ModelProvider[],
  models: ModelInfo[],
): void {
  cachedProviders = providers;
  cachedModels = models;
  console.log(
    `[provider-registry] Initialised: ${providers.length} provider(s), ${models.length} model(s)`,
  );
}

/**
 * Find which provider owns a given model name.
 *
 * @param modelName — e.g. "qwen3:8b" or "mlx-Qwen3-35B-A3B-4bit"
 * @returns Provider name + baseUrl, or `undefined` if the model isn't in any
 *          discovered model list.
 */
export function findProviderForModel(
  modelName: string,
): ProviderLookup | undefined {
  const model = cachedModels.find((m) => m.name === modelName);
  if (!model) return undefined;

  const provider = cachedProviders.find((p) => p.name === model.provider);
  if (!provider) {
    console.warn(
      `[provider-registry] Model "${modelName}" belongs to provider "${model.provider}" but that provider is no longer reachable`,
    );
    return undefined;
  }

  return {
    provider: model.provider,
    baseUrl: provider.baseUrl,
  };
}
