import type { OllamaModel } from "./protocol.js";

const defaultBase = () => process.env.OLLAMA_HOST ?? "http://localhost:11434";

const OLLAMA_INSTALL_URL = "https://ollama.com/download";

export async function getOllamaVersion(ollamaBase = defaultBase()): Promise<{ version: string; reachable: boolean }> {
  try {
    const res = await fetch(`${ollamaBase}/api/version`);
    const data = (await res.json()) as { version: string };
    return { version: data.version, reachable: true };
  } catch {
    console.warn(`[ollama] Cannot reach Ollama at ${ollamaBase}`);
    console.warn(`[ollama] Make sure Ollama is running. Install: ${OLLAMA_INSTALL_URL}`);
    return { version: "unknown", reachable: false };
  }
}

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

export async function getOllamaModels(ollamaBase = defaultBase()): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${ollamaBase}/api/tags`);
    const data = (await res.json()) as {
      models: { name: string; size: number }[];
    };

    const runtimeCap = process.env.OLLAMA_CONTEXT_LENGTH
      ? parseInt(process.env.OLLAMA_CONTEXT_LENGTH, 10)
      : undefined;

    const results = await Promise.all(
      data.models.map(async (m): Promise<OllamaModel> => {
        const base: OllamaModel = { name: m.name, size: m.size };
        try {
          const showRes = await fetch(`${ollamaBase}/api/show`, {
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
          // /api/show failed for this model — return without contextLength
        }
        return base;
      }),
    );

    return results;
  } catch {
    return [];
  }
}


