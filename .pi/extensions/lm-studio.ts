import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

/**
 * LM Studio local model provider.
 *
 * LM Studio exposes an OpenAI-compatible API on port 1234.
 * Start a model in LM Studio and enable the local server.
 *
 * Configuration via environment variables:
 *   LM_STUDIO_BASE_URL  - override base URL (default: http://127.0.0.1:1234/v1)
 *   LM_STUDIO_API_KEY   - API key (default: lm-studio)
 */
export default async function (pi: ExtensionAPI) {
  const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1"
  const apiKey = process.env.LM_STUDIO_API_KEY || "lm-studio"

  let models: Array<{ id: string }> = []

  try {
    const res = await fetch(`${baseUrl}/models`)
    const body = (await res.json()) as {
      data?: Array<{ id: string }>
      object?: string
    }

    // LM Studio returns { object: "list", data: [...] }
    models = body.data ?? []
  } catch {
    // Server not running — register with no models; they'll appear when it starts
  }

  // Only include chat/language models (skip embedding models)
  const skipModels = ["nomic-embed-text", "text-embedding", "all-MiniLM"]
  const chatModels = models.filter(
    (m) => !skipModels.some((skip) => m.id.toLowerCase().includes(skip.toLowerCase()))
  )

  // Models known to support reasoning/thinking
  const reasoningModels = new Set<string>([
    "qwen3.5-27b-claude-4.6-opus-reasoning-distilled",
  ])

  // Vision models (detected by keywords in the model id)
  const visionKeywords = ["vl", "vision", "llava", "minicpm-v", "internvl2"]

  pi.registerProvider("lm-studio", {
    name: "LM Studio (Local)",
    baseUrl,
    apiKey,
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models: chatModels.map((m) => {
      const lowerId = m.id.toLowerCase()
      const isReasoning = reasoningModels.has(m.id) || lowerId.includes("reasoning") || lowerId.includes("qwen3")
      const isVision = visionKeywords.some((kw) => lowerId.includes(kw))

      return {
        id: m.id,
        name: m.id,
        reasoning: isReasoning,
        input: isVision ? (["text", "image"] as const) : (["text"] as const),
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
