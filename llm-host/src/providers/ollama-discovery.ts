import type { ModelInfo, ModelProvider } from "./types.js";

const OLLAMA_INSTALL_URL = "https://ollama.com/download";

/**
 * Extract a context_length value from Ollama's model_info object.
 * Keys look like "llama.context_length", "qwen3.context_length", etc.
 */
function extractContextLength(modelInfo: Record<string, unknown>): number | undefined {
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith(".context_length") && typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

/**
 * OllamaProvider discovers models from a local Ollama instance.
 * Implements the ModelProvider interface.
 */
export class OllamaProvider implements ModelProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  }

  async version(): Promise<{ version: string; reachable: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`);
      const data = (await res.json()) as { version: string };
      return { version: data.version, reachable: true };
    } catch {
      console.warn(`[ollama] Cannot reach Ollama at ${this.baseUrl}`);
      console.warn(`[ollama] Make sure Ollama is running. Install: ${OLLAMA_INSTALL_URL}`);
      return { version: "unknown", reachable: false };
    }
  }

  async models(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      const data = (await res.json()) as {
        models: { name: string; size: number }[];
      };

      const runtimeCap = process.env.OLLAMA_CONTEXT_LENGTH
        ? parseInt(process.env.OLLAMA_CONTEXT_LENGTH, 10)
        : undefined;

      const results = await Promise.all(
        data.models.map(async (m): Promise<ModelInfo> => {
          const base: ModelInfo = { name: m.name, size: m.size, provider: "ollama" };
          try {
            const showRes = await fetch(`${this.baseUrl}/api/show`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: m.name }),
            });
            const showData = (await showRes.json()) as {
              model_info?: Record<string, unknown>;
              capabilities?: string[];
            };
            const modelInfo = showData.model_info;
            if (modelInfo) {
              const modelContext = extractContextLength(modelInfo);
              if (modelContext !== undefined) {
                base.contextLength = runtimeCap !== undefined
                  ? Math.min(runtimeCap, modelContext)
                  : modelContext;
              }
            }
            if (showData.capabilities && Array.isArray(showData.capabilities)) {
              base.capabilities = showData.capabilities;
            }
          } catch {
            // /api/show failed for this model — return without contextLength/capabilities
          }
          return base;
        }),
      );

      return results;
    } catch {
      return [];
    }
  }
}
