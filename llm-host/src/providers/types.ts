/** Information about a single model discovered from a provider. */
export interface ModelInfo {
  name: string;
  size: number;
  /** Provider that discovered this model (e.g. "ollama", "mlx"). */
  provider: string;
  contextLength?: number;
  capabilities?: string[];
}

/**
 * A model provider discovers available models from a local LLM runtime
 * (e.g. Ollama, MLX). If the runtime is not reachable, version() reports
 * reachable=false and models() returns an empty array.
 */
export interface ModelProvider {
  name: string;
  version(): Promise<{ version: string; reachable: boolean }>;
  models(): Promise<ModelInfo[]>;
}
