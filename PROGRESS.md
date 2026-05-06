# Progress Log

## 2026-05-06 — Thinking Process In-Stream Panel

### Problem

When the model is thinking, the UI shows a collapsible "Thoughts" block above the message — collapsed by default. The user has to manually click to see what the model is reasoning about. This feels disconnected from the streaming experience.

### Desired Behavior

While the model is thinking, show the thinking content in a fixed-height, borderless panel inside the streaming message bubble. The panel auto-scrolls down as content grows, has a gradient blur at the top, and disappears (with a fade-out animation) once the response is complete. Completed messages keep their existing collapsible reasoning block unchanged.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **T1** | ✅ DONE | **Rewrite `StreamingThinkingBlock` to in-stream panel** — Replace the collapsible `<button>` + conditional `<div>` with a fixed-height (`h-48`) borderless panel. Auto-scrolls to bottom as content grows. Add a gradient blur mask at the top of the panel (`mask-image` or pseudo-element with gradient fade). Show a subtle "Thinking…" label with pulsing dot. Panel is always visible while `isThinkingStreaming` is true — no toggle. Add `useRef` + `useEffect` for auto-scroll. |
| **T2** | ✅ DONE | **Fade-out transition when thinking completes** — When `isThinkingStreaming` transitions from `true` → `false`, the thinking panel should animate out (e.g. collapse height + fade opacity over ~400ms) and then be removed from the DOM. The completed message content appears normally below where the panel was. |
| **T3** | ✅ DONE | **Update `StreamingMessageBubble` tests** — Update existing tests that check for the collapsible "Thoughts" button. New tests: panel renders when `thinkingContent` provided while streaming; panel has fixed height; auto-scroll ref is attached; pulsing indicator shown; panel disappears when `isThinkingStreaming=false` and stream completes. |

### Design Decisions

- **Only streaming view changes** — Completed messages (via `MessageBubble` / `ReasoningBlock`) keep their existing collapsible behavior (Option C).
- **No toggle** — The thinking panel is always visible during streaming. No user interaction needed.
- **Gradient blur at top** — Uses CSS `mask-image` with a linear gradient to fade out the top portion of the thinking text, creating a depth/blurring effect as content scrolls.
- **Auto-scroll** — `useRef` on the scroll container + `useEffect` triggered by content length changes.
- **Fade-out animation** — When thinking ends, animate height to 0 + opacity to 0 over ~400ms, then unmount. Uses CSS transition or `onTransitionEnd` callback.

## 2026-05-06 — Streaming Context & Activity Status

### Problem

During a streaming LLM call, the user sees a blinking cursor and a "Thoughts" collapsible — but has **zero visibility** into:

1. **Context window pressure**: Reasoning tokens, tool call messages, and multi-turn loops all consume context *within the current call*, but the user only sees In/Out/Reason totals **after** the call finishes. If the model hits the context limit mid-call, the user has no idea why it failed.

2. **What the agent is doing**: The agent may be in a thinking phase, executing a tool (e.g. `read`, `bash`), or generating the final response. The thinking content is inside a collapsed collapsible, so unless the user opens it and reads through, they have no clue what's happening. There's no short status like "Running read…" or "Reasoning…".

3. **Multi-turn loop opacity**: The agent loop (prompt → LLM → tool call → tool result → LLM → … → final answer) can run multiple turns. The user sees only the final streaming text — no indication of which turn, which tool, or how much context has accumulated.

### Key Insight: Data Already Exists in the SSE Pipeline

The pi-agent-core Agent emits fine-grained events through the entire loop:

| Event | Carries | Current client handling |
|-------|---------|----------------------|
| `thinking_start` / `thinking_delta` / `thinking_end` | Reasoning text | ✅ Handled |
| `text_delta` | Output text | ✅ Handled |
| `toolcall_start` / `toolcall_end` | LLM requesting a tool | ❌ Ignored |
| `tool_execution_start` / `tool_execution_end` | Tool name, args, result | ❌ Ignored |
| `turn_start` / `turn_end` | Loop iterations | ❌ Ignored |
| `message_start` / `message_end` | Per-LLM-call boundaries, **usage data** | ❌ Ignored |

These events flow through: `pi-agent-core → llm-host (onEvent callback) → server (SSE flatten) → client (useStreamingChat)`. The client currently only handles `text_delta`, `thinking_*`, `done`, and `error` — everything else is silently dropped.

Additionally:
- `AssistantMessageEvent` deltas carry a `partial: AssistantMessage` which includes `usage` (input, output, totalTokens). However, for Ollama, usage is only populated on the final chunk.
- The model's `contextWindow` is already available via the agent API (used to configure the model in `agent-runner.ts`).
- After each `message_end`, we get real token counts. Between `message_start` and `message_end`, we estimate from char counts (~4 chars/token).

### Slices

| # | Status | Description |
|---|--------|-------------|
| **SC1** | TODO | **Handle new SSE events in `useStreamingChat`** — Add state for streaming activity, tool calls, turn count, and usage. Handle `tool_execution_start` (push to tool calls, set activity="tool"), `tool_execution_end` (mark done), `turn_start` (increment turn), `message_end` (extract real usage, accumulate across turns), `thinking_start` (set activity="reasoning"), `text_delta` on empty content (set activity="generating"). Estimate current-turn tokens from char counts (~4 chars/token). Expose `streamingContextInfo`: `{ usedTokens: number, contextWindow: number | undefined, turnCount: number, toolCalls: Array<{name, done}>, activity: 'reasoning' | 'tool' | 'generating' | 'idle', reasoningSoFar: number, outputSoFar: number }`. Tests: parseSseChunk already tested; add unit tests for the new state transitions. |
| **SC2** | TODO | **Add streaming status line to `StreamingMessageBubble`** — Below the sender name and above the thinking/text content, show a compact activity status line. States: `🔵 Reasoning… (1.2k chars)`, `🔧 Running: read (src/index.ts)`, `📝 Generating response…`. When a tool finishes, show a checkmark. On multi-turn: `Turn 2 · ✓read · 🔧bash`. Style: subtle, small text, same area as current agent-name label. Conditionally visible only during streaming (hidden once stream completes). The activity label should be derived from the `streamingContextInfo` state. |
| **SC3** | TODO | **Update stats bar during streaming** — When `isStreaming` is true, the `AggregateStatsBar` should render live context usage from `streamingContextInfo.usedTokens` instead of stale persisted data. Show a pulsing/dynamic context percentage bar. When streaming completes, revert to persisted `totalIn`/`totalOut`/`totalReasoning` from `chatDetail`. Need to thread `streamingContextInfo` and `contextWindow` (from agent model info) down through ChatView. |
| **SC4** | TODO | **Handle new SSE events in `useStreamingWorkspaceChat`** — Same treatment as SC1 but for workspace multi-agent streaming. The workspace hook needs per-agent `streamingContextInfo` added to `AgentStreamState`. Handle `tool_execution_start/end`, `turn_start`, `message_end` events with `agentId` forwarding. |
| **SC5** | TODO | **Update `StreamingMessageBubble` tests** — Add tests for the new activity status line rendering for each state (reasoning, tool-call, generating, idle). Verify tool call chip shows tool name, verify turn count displays, verify the status line is hidden after streaming completes. |

### Design Decisions

- **Context estimation strategy**: After each `message_end` event we use real token counts from `usage`. During an in-progress LLM call (between `message_start` and `message_end`), we estimate from accumulated char counts at ~4 chars/token. This is the same heuristic Ollama uses internally.
- **Activity state is a simple string enum**, not a complex state machine. The current activity is whichever event type was most recently received. This avoids complex state transitions.
- **Tool call info is an array of `{name, done}` objects** — starts empty, grows with each `tool_execution_start`, marks `done=true` on `tool_execution_end`. The UI renders these as compact chips.
- **Turn count increments on `turn_start`**, giving the user visibility into multi-turn loops.
- **Context window comes from the Ollama model metadata** (already available via agent API). We pass it through `streamingContextInfo.contextWindow`.
- **No new SSE events needed server-side** — all the events already flow through the pipeline; the client was just ignoring them.
