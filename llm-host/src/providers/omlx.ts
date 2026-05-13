/**
 * Omlx provider for @mariozechner/pi-ai.
 *
 * Registers the "omlx" API so that models can call
 * omlx's OpenAI-compatible `/v1/chat/completions` endpoint
 * for streaming chat completions, thinking blocks, and tool calls.
 *
 * omlx requires an API key (set via OMLX_API_KEY env var) which
 * is sent as Authorization: Bearer header.
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
  process.env.OMLX_HOST ?? "http://localhost:8000";

function omlxUrl(model: Model<string>, path: string): string {
  const base = model.baseUrl || defaultBase();
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}${path}`;
}

function getApiKey(): string {
  return process.env.OMLX_API_KEY ?? "";
}

type OmlxTextPart = { type: "text"; text: string };
type OmlxImagePart = { type: "image_url"; image_url: { url: string } };
type OmlxContentPart = OmlxTextPart | OmlxImagePart;

interface OmlxChatMessage {
  role: string;
  content?: string | OmlxContentPart[];
}

function buildUserContent(content: string | Array<TextContent | ImageContent>): string | OmlxContentPart[] {
  if (typeof content === "string") return content;

  const parts: OmlxContentPart[] = [];
  let hasImages = false;

  for (const block of content) {
    if (block.type === "text") {
      if (block.text.length > 0) {
        parts.push({ type: "text", text: block.text });
      }
      continue;
    }

    if (block.type === "image") {
      hasImages = true;
      const mimeType = block.mimeType || "application/octet-stream";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${block.data}` },
      });
    }
  }

  if (!hasImages) {
    return parts
      .filter((part): part is OmlxTextPart => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  return parts;
}

export function buildOmlxMessages(context: Context): OmlxChatMessage[] {
  const msgs: OmlxChatMessage[] = [];
  if (context.systemPrompt) {
    msgs.push({ role: "system", content: context.systemPrompt });
  }
  for (const m of context.messages) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: buildUserContent(m.content) });
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
      msgs.push({ role: "tool", content: text });
    }
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// streamSimple — SSE-based streaming via /v1/chat/completions
// ---------------------------------------------------------------------------

export function streamSimpleOmlx(
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
        messages: buildOmlxMessages(context),
        stream: true,
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

      const apiKey = getApiKey();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const payload = JSON.stringify(body);
      console.log(`[omlx] POST /v1/chat/completions model=${model.id} payloadBytes=${payload.length} apiKey=${apiKey ? "set" : "unset"}`);

      const res = await fetch(omlxUrl(model, "/v1/chat/completions"), {
        method: "POST",
        headers,
        body: payload,
        signal: options?.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `omlx /v1/chat/completions returned ${res.status}: ${errText.slice(0, 200)}`,
        );
      }

      if (!res.body) {
        throw new Error("omlx response has no body");
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

        // Parse SSE lines: each data line is prefixed with "data: "
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          if (!data) continue;

          const chunk = JSON.parse(data);
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // ── Tool calls ────────────────────────────────────────────────
          if (delta.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              const args =
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments || "{}")
                  : tc.function.arguments ?? {};
              const toolBlock: ToolCall = {
                type: "toolCall",
                id: tc.id ?? "",
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

          // ── Thinking block (reasoning_content) ────────────────────────
          if (delta.reasoning_content !== undefined && delta.reasoning_content !== "") {
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
            existing.thinking += delta.reasoning_content;
            stream.push({
              type: "thinking_delta",
              contentIndex: thinkingIndex,
              delta: delta.reasoning_content,
              partial: { ...output },
            });
          }

          // ── Text content ──────────────────────────────────────────────
          if (delta.content !== undefined && delta.content !== "") {
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
            existing.text += delta.content;
            stream.push({
              type: "text_delta",
              contentIndex: textIndex,
              delta: delta.content,
              partial: { ...output },
            });
          }

          // ── Final chunk ───────────────────────────────────────────────
          if (choice.finish_reason) {
            const usage = chunk.usage ?? {};
            const promptTokens = usage.prompt_tokens ?? 0;
            const completionTokens = usage.completion_tokens ?? 0;
            output.usage = {
              input: promptTokens,
              output: completionTokens,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: promptTokens + completionTokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };

            let reason: "stop" | "length" | "toolUse" = "stop";
            if (choice.finish_reason === "length") reason = "length";
            else if (choice.finish_reason === "tool_calls") reason = "toolUse";

            output.stopReason = reason;
            output.timestamp = Date.now();

            stream.push({ type: "done", reason, message: { ...output } });
            stream.end({ ...output });
            return;
          }
        }
      }

      // Stream ended without a finish_reason
      output.stopReason = "error";
      output.errorMessage = "omlx stream ended without finish_reason";
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

export function streamOmlx(
  _model: Model<string>,
  _context: Context,
  _options?: StreamOptions,
): ReturnType<typeof createAssistantMessageEventStream> {
  throw new Error("streamOmlx (reasoning-aware) is not implemented yet");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOmlxApi(): void {
  registerApiProvider({
    api: "omlx",
    stream: streamOmlx,
    streamSimple: streamSimpleOmlx,
  });
}

// ---------------------------------------------------------------------------
// Model factory — convenience helper
// ---------------------------------------------------------------------------

export function createOmlxModel(options: {
  id: string;
  baseUrl?: string;
  /** Max output tokens. Default: 32000. */
  maxTokens?: number;
  /** Context window size. Default: 0 (unknown). */
  contextWindow?: number;
  /** Whether the model supports reasoning/thinking. Default: true. */
  reasoning?: boolean;
}): Model<"omlx"> {
  return {
    id: options.id,
    name: options.id,
    api: "omlx",
    provider: "omlx",
    baseUrl: options.baseUrl ?? defaultBase(),
    reasoning: options.reasoning ?? true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: options.contextWindow ?? 0,
    maxTokens: options.maxTokens ?? 32000,
  };
}