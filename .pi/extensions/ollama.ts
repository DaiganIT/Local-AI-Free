import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

export default async function (pi: ExtensionAPI) {
  try {
    const res = await fetch("http://localhost:11434/api/tags")
    const body = (await res.json()) as {
      models: Array<{ name: string }>
    }
  } catch (err) {
    console.warn("Server not running")
    return
  }

  // Only include chat models (skip embedding models)
  const skipModels = ["nomic-embed-text"]
  const chatModels = body.models.filter((m) => !skipModels.includes(m.name))

  // Models known to support reasoning/thinking
  const reasoningModels = new Set(["qwen3:8b", "lfm2.5-thinking"])
  // Vision models
  const visionModels = new Set(["qwen3-vl:2b"])

  pi.registerProvider("ollama", {
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    api: "openai-completions",
    models: chatModels.map((m) => {
      const isReasoning = reasoningModels.has(m.name)
      const isVision = visionModels.has(m.name)

      return {
        id: m.name,
        name: m.name,
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
