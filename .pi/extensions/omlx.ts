import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

/**
 * omlx local model provider.
 *
 * omlx is a multi-model OpenAI-compatible LLM server for Apple Silicon.
 * Start it with: omlx serve --port 8000
 *
 * Configuration via environment variables:
 *   OMLX_BASE_URL  - override base URL (default: http://127.0.0.1:8000/v1)
 *   OMLX_API_KEY   - API key if omlx was started with --api-key
 */
export default async function (pi: ExtensionAPI) {
  const baseUrl = process.env.OMLX_BASE_URL || "http://127.0.0.1:8000/v1"
  const apiKey = process.env.OMLX_API_KEY || "pietro"

  let models: Array<{ id: string }> = []

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const body = (await res.json()) as {
      data?: Array<{ id: string }>
      object?: string
    }

    // omlx returns { object: "list", data: [...] }
    models = body.data ?? []
  } catch {
    // Server not running — register with no models; they'll appear when it starts
  }

  // Models known to support reasoning/thinking
  const reasoningModels = new Set<string>([
    "Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit",
    "gemma-4-26B-A4B-it-MLX-8bit",
    "gemma-4-E4B-it-MLX-4bit",
  ])

  pi.registerProvider("omlx", {
    name: "omlx (Local)",
    baseUrl,
    apiKey,
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models: models.map((m) => {
      const isReasoning = reasoningModels.has(m.id)

      return {
        id: m.id,
        name: m.id,
        reasoning: isReasoning,
        input: ["text"] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
        ...(isReasoning && {
          compat: {
            thinkingFormat: "qwen-chat-template" as const,
          },
        }),
      }
    }),
  })
}
