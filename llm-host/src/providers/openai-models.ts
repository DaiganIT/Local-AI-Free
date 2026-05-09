/**
 * Factory for creating Model<"openai-completions"> objects.
 *
 * Local providers (MLX, OMLX, LM Studio) expose an OpenAI-compatible
 * `/v1/chat/completions` endpoint. The pi-ai package already ships with
 * a registered "openai-completions" API provider that knows how to call
 * this endpoint, stream responses, and handle tool calls.
 *
 * This factory simply constructs the `Model` descriptor so the agent
 * runner can pick the correct streaming path (Ollama vs. OpenAI-completions)
 * without hardcoding any provider URLs.
 */
import type { Model } from "@mariozechner/pi-ai";

/** Default context window when the provider didn't report one. */
const DEFAULT_CONTEXT_WINDOW = 131072;

/** Default max output tokens per response. */
const DEFAULT_MAX_TOKENS = 32000;

export interface OpenAIModelOptions {
  /** Model id, e.g. "qwen3:8b" or "mlx-Qwen3-35B-A3B-4bit". */
  id: string;
  /** OpenAI-compatible API base URL (e.g. `http://localhost:11435`). */
  baseUrl: string;
  /** Display name (defaults to `id`). */
  name?: string;
  /** Provider name for the model card (defaults to "openai-completions"). */
  provider?: string;
  /** Context window in tokens (defaults to 131072). */
  contextWindow?: number;
  /** Max output tokens (defaults to 32000). */
  maxTokens?: number;
  /** Whether the model supports reasoning/thinking (defaults to true). */
  reasoning?: boolean;
}

/**
 * Create a `Model<"openai-completions">` for use with the pi-ai agent runner.
 *
 * @example
 * ```ts
 * const model = createOpenAIModel({
 *   id: "qwen3:8b",
 *   baseUrl: "http://localhost:11435",
 *   provider: "mlx",
 * });
 * ```
 */
export function createOpenAIModel(
  options: OpenAIModelOptions,
): Model<"openai-completions"> {
  return {
    id: options.id,
    name: options.name ?? options.id,
    api: "openai-completions",
    provider: options.provider ?? "openai-completions",
    baseUrl: options.baseUrl,
    reasoning: options.reasoning ?? true,
    input: ["text"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: options.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
}
