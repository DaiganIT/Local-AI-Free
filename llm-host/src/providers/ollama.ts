/**
 * Ollama provider for @mariozechner/pi-ai.
 *
 * Registers the "ollama" API so that models can call
 * Ollama's native `/api/chat` endpoint for streaming chat
 * completions, thinking blocks, and tool calls.
 *
 * `streamOllama()` (reasoning-aware) is not supported yet and throws.
 */
import {
  registerApiProvider,
  createAssistantMessageEventStream,
  type Context,
  type Model,
  type StreamOptions,
  type AssistantMessage,
  type TextContent,
  type ImageContent,
  type ThinkingContent,
  type ToolCall,
} from "@mariozechner/pi-ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultBase = () =>
  process.env.OLLAMA_HOST ?? "http://localhost:11434";

function ollamaUrl(model: Model<string>, path: string): string {
  const base = model.baseUrl || defaultBase();
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}${path}`;
}

interface OllamaMessage {
  role: string;
  content?: string;
  images?: string[];
}

export function buildOllamaMessages(context: Context): OllamaMessage[] {
  const msgs: OllamaMessage[] = [];
  if (context.systemPrompt) {
    msgs.push({ role: "system", content: context.systemPrompt });
  }
  for (const m of context.messages) {
    if (m.role === "user") {
      const text =
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((b): b is TextContent => b.type === "text")
              .map((b) => b.text)
              .join("");
      const images =
        typeof m.content === "string"
          ? undefined
          : m.content
              .filter((b): b is ImageContent => b.type === "image")
              .map((b) => b.data);
      const msg: OllamaMessage = { role: "user", content: text };
      if (images && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          console.log(`[buildOllamaMessages] image[${i}]: base64Length=${img.length}, preview=${img.slice(0, 20)}...`);
        }
        msg.images = images;
      }
      msgs.push(msg);
    } else if (m.role === "assistant") {
      msgs.push({
        role: "assistant",
        content: m.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join(""),
      });
    } else if (m.role === "toolResult") {
      const text = m.content
        .filter((b): b is TextContent => b.type === "text")
        .map((b) => b.text)
        .join("");
      // Ollama's /api/chat only supports images in 'user' role messages.
      // Images in tool results are dropped here with a warning to avoid
      // crashing the model runner. The text content is preserved.
      const droppedImages = m.content
        .filter((b): b is ImageContent => b.type === "image");
      if (droppedImages.length > 0) {
        console.warn(`[buildOllamaMessages] Dropping ${droppedImages.length} image(s) from tool result — Ollama does not support images in tool messages`);
        for (let i = 0; i < droppedImages.length; i++) {
          console.log(`[buildOllamaMessages]   dropped image[${i}]: mimeType=${droppedImages[i].mimeType}, base64Length=${droppedImages[i].data.length}`);
        }
      }
      const msg: OllamaMessage = { role: "tool", content: text };
      msgs.push(msg);
    }
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// streamSimple — the one we actually need
// ---------------------------------------------------------------------------

export function streamSimpleOllama(
  model: Model<string>,
  context: Context,
  options?: StreamOptions,
): ReturnType<typeof createAssistantMessageEventStream> {
  const stream = createAssistantMessageEventStream();

  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  // Emit start event so the agent-loop sets up partialMessage tracking
  stream.push({ type: "start", partial: output });

  // Abort support
  options?.signal?.addEventListener(
    "abort",
    () => {
      const err: AssistantMessage = {
        ...output,
        stopReason: "aborted",
        timestamp: Date.now(),
      };
      stream.push({ type: "error", reason: "aborted", error: err });
      stream.end(err);
    },
    { once: true },
  );

  (async () => {
    try {
      const body: Record<string, unknown> = {
        model: model.id,
        messages: buildOllamaMessages(context),
        stream: true,
        ...(model.reasoning ? { think: true } : {}),
      };

      if (context.tools?.length) {
        body.tools = context.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }
      if (options?.maxTokens !== undefined) {
        body.max_tokens = options.maxTokens;
      }

      const payload = JSON.stringify(body);
      const totalMsgs = (body.messages as OllamaMessage[])?.length ?? 0;
      const imgMsgs = ((body.messages as OllamaMessage[]) ?? []).filter(m => m.images && m.images.length > 0);
      console.log(`[ollama] POST /api/chat model=${model.id} payloadBytes=${payload.length} messages=${totalMsgs} messagesWithImages=${imgMsgs.length}`);
      for (const m of imgMsgs) {
        for (let i = 0; i < (m.images?.length ?? 0); i++) {
          const imgData = m.images![i];
          console.log(`[ollama]   role=${m.role} image[${i}]: base64Length=${imgData.length}, preview=${imgData.slice(0, 30)}...`);
        }
      }

      const res = await fetch(ollamaUrl(model, "/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: options?.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Ollama /api/chat returned ${res.status}: ${errText.slice(0, 200)}`,
        );
      }

      if (!res.body) {
        throw new Error("Ollama response has no body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Track which content blocks we're building
      let textIndex = -1;
      let thinkingIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const chunk = JSON.parse(line);
          const msg = chunk.message;
          if (!msg) continue;

          // ── Tool calls ────────────────────────────────────────────────
          if (msg.tool_calls?.length) {
            for (const tc of msg.tool_calls) {
              const args =
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments || "{}")
                  : tc.function.arguments ?? {};
              const toolBlock: ToolCall = {
                type: "toolCall",
                id: tc.id,
                name: tc.function.name,
                arguments: args,
              };
              const idx = output.content.length;
              output.content.push(toolBlock);
              stream.push({
                type: "toolcall_start",
                contentIndex: idx,
                partial: { ...output },
              });
              stream.push({
                type: "toolcall_end",
                contentIndex: idx,
                toolCall: toolBlock,
                partial: { ...output },
              });
            }
            continue;
          }

          // ── Thinking block ────────────────────────────────────────────
          if (msg.thinking !== undefined && msg.thinking !== "") {
            if (thinkingIndex === -1) {
              thinkingIndex = output.content.length;
              const block: ThinkingContent = { type: "thinking", thinking: "" };
              output.content.push(block);
              stream.push({
                type: "thinking_start",
                contentIndex: thinkingIndex,
                partial: { ...output },
              });
            }
            const existing = output.content[thinkingIndex] as ThinkingContent;
            existing.thinking += msg.thinking;
            stream.push({
              type: "thinking_delta",
              contentIndex: thinkingIndex,
              delta: msg.thinking,
              partial: { ...output },
            });
          }

          // ── Text content ──────────────────────────────────────────────
          if (msg.content !== undefined && msg.content !== "") {
            if (textIndex === -1) {
              textIndex = output.content.length;
              const block: TextContent = { type: "text", text: "" };
              output.content.push(block);
              stream.push({
                type: "text_start",
                contentIndex: textIndex,
                partial: { ...output },
              });
            }
            const existing = output.content[textIndex] as TextContent;
            existing.text += msg.content;
            stream.push({
              type: "text_delta",
              contentIndex: textIndex,
              delta: msg.content,
              partial: { ...output },
            });
          }

          // ── Final chunk ───────────────────────────────────────────────
          if (chunk.done) {
            const promptTokens = chunk.prompt_eval_count ?? 0;
            const completionTokens = chunk.eval_count ?? 0;
            // Split thinking tokens from output tokens? Ollama doesn't report
            // thinking token count separately, so we include eval_count in
            // total output. The distinction would be nice but the Ollama API
            // doesn't expose it. TODO: investigate if Ollama adds thinking
            // token counts in a future release.
            output.usage = {
              input: promptTokens,
              output: completionTokens,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: promptTokens + completionTokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };

            let reason: "stop" | "length" | "toolUse" = "stop";
            if (chunk.done_reason === "length") reason = "length";
            else if (chunk.done_reason === "tool_calls") reason = "toolUse";

            output.stopReason = reason;
            output.timestamp = Date.now();

            stream.push({ type: "done", reason, message: { ...output } });
            stream.end({ ...output });
            return;
          }
        }
      }

      // Stream closed without a "done" chunk
      output.stopReason = "error";
      output.errorMessage = "Ollama stream ended without done marker";
      output.timestamp = Date.now();
      stream.push({ type: "error", reason: "error", error: { ...output } });
      stream.end({ ...output });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.stopReason = "error";
      output.errorMessage = message;
      output.timestamp = Date.now();
      stream.push({ type: "error", reason: "error", error: { ...output } });
      stream.end({ ...output });
    }
  })();

  return stream;
}

// ---------------------------------------------------------------------------
// stream — reasoning-aware version (not implemented yet)
// ---------------------------------------------------------------------------

export function streamOllama(
  _model: Model<string>,
  _context: Context,
  _options?: StreamOptions,
): ReturnType<typeof createAssistantMessageEventStream> {
  throw new Error("streamOllama (reasoning-aware) is not implemented yet");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOllamaApi(): void {
  registerApiProvider({
    api: "ollama",
    stream: streamOllama,
    streamSimple: streamSimpleOllama,
  });
}

// ---------------------------------------------------------------------------
// Model factory — convenience helper
// ---------------------------------------------------------------------------

export function createOllamaModel(options: {
  id: string;
  baseUrl?: string;
  /** Max output tokens. Default: 32000. */
  maxTokens?: number;
  /** Context window size. Default: 0 (unknown). */
  contextWindow?: number;
  /** Whether the model supports reasoning/thinking. Default: true. */
  reasoning?: boolean;
}): Model<"ollama"> {
  return {
    id: options.id,
    name: options.id,
    api: "ollama",
    provider: "ollama",
    baseUrl: options.baseUrl ?? defaultBase(),
    reasoning: options.reasoning ?? true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: options.contextWindow ?? 0,
    maxTokens: options.maxTokens ?? 32000,
  };
}
