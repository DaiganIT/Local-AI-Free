# Progress Log

## 2026-05-05 — Open Source Release

### Goal
Convert the project from three separate git repos into a monorepo, fix port conflicts, add docs, and make it ready for open-source release under Polyform Noncommercial license.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **O1** | ✅ DONE | **Fix port defaults** — Server stays at 3000, client moves to 4000 (dev port), update .env.example files accordingly |
| **O2** | ✅ DONE | **Make Ollama a soft requirement** — If Ollama is unreachable on startup, print helpful message with install URL instead of crashing. llm-host stays running, reports 0 models. |
| **O3** | ✅ DONE | **Convert to monorepo** — Init root git repo, set up npm workspaces, root scripts for install/build/test/dev, removed individual .git repos |
| **O4** | ✅ DONE | **Add PolyForm Noncommercial LICENSE** |
| **O5** | ✅ DONE | **Write README.md** — Project overview, architecture, prerequisites (Ollama), quickstart, dev setup, env vars |
| **O6** | ✅ DONE | **Write CONTRIBUTING.md** — Dev setup, how to run tests, PR process |
| **O7** | ✅ DONE | **Add root .gitignore, clean up** — Removed pi-readme.md, markitdown-readme.md, empty root package.json. Added root .gitignore with monorepo-aware entries. |

## 2026-05-05 — Server Refactor: routes.ts Breakdown

### Problem

`routes.ts` is a 1397-line monolith. A single `createApp()` function contains all 25+ endpoint handlers inline, mixing routing, validation, fan-out orchestration, SSE streaming, error handling, auth, and request/response typing. This makes the file hard to navigate, test, and maintain. Key symptoms:

- **Fan-out pattern duplicated ~15 times** — "iterate hosts, try each, collect errors" copy-pasted with minor variations
- **SSE streaming logic duplicated 2×** — nearly identical ~80-line blocks for agent chat stream and workspace chat stream
- **No shared types for request/response** — every handler casts `req.body` with inline `as` types
- **Inconsistent error handling** — varying status codes and error shapes across similar endpoints
- **No validation layer** — manual `if (!param)` checks scattered everywhere
- **Handlers untestable in isolation** — must create full Express app to test any single endpoint
- **All agent endpoints inside one `if (agentRouter)` guard** — giant indentation cliff

### Refactor Plan

Slices are ordered by dependency (each builds on the prior). Each slice is small enough to test end-to-end before moving on.

| # | Status | Description |
|---|--------|-------------|
| **S1** | ✅ DONE | **Extract fan-out helper** — Created `src/fanout.ts` with three helpers: `fanOutToAllHosts` (parallel fan-out for listing), `fanOutToFirstHost` (sequential first-success-wins), `fanOutToSpecificHost` (single host by ID). Also `FanOutError` (with status, errors[]) and `NoHostsError` custom error classes. 14 tests in `tests/fanout.test.ts`. Routes.ts not yet updated to use these (that follows in S5/S6 when handlers are extracted). |
| **S2** | ✅ DONE | **Extract shared types** — Created `src/api-types.ts` with typed request interfaces (`CreateAgentRequest`, `SendMessageRequest`, etc.), `ErrorResponse` type, and `errorResponse()` helper. Replaced all inline `req.body as { ... }` casts in routes.ts with named types. Updated 2 handler validation blocks to use `errorResponse()`. All 215 tests still green. |
| **S3** | ✅ DONE | **Extract SSE streaming helper** — Created `src/sse.ts` with `streamToSse()` function that handles SSE headers, fan-out to acquire stream, event forwarding, `message_update` flattening, `preserveAgentId` option, disconnect abort, error/done events. Replaced both duplicated ~80-line SSE blocks in routes.ts. Added 7 tests in `tests/sse.test.ts`. Routes.ts shrunk from 1397 → 1264 lines. |
| **S4** | ✅ DONE | **Create validation helpers** — Created `src/validate.ts` with `requireParam()`, `requireField()`, `requireQuery()` (type-narrowing guards), plus `missingParam()`, `missingField()`, `missingQuery()`, `noHostsConnected()`, `hostNotFound()` convenience functions. 12 tests in `tests/validate.test.ts`. Applied to 2 representative handlers (`getAgentChats`, `deleteAgentFile`) as proof-of-concept. Full mechanical replacement deferred to S6 (handler extraction) to avoid a massive diff. |
| **S5** | ✅ DONE | **Split routes.ts into domain routers** — Created `src/routes/app.ts` (createApp + CORS + middleware + router mounting), `health.ts`, `hosts.ts`, `agents.ts`, `chats.ts`, `workspaces.ts`. Old `routes.ts` now re-exports from `app.ts` for backward compat. Also moved `requireAuth` middleware from routes to `auth.ts`. All 234 tests green. Monolith (1254 lines) → 6 focused modules (42 + 4 + 11 + 394 + 152 + 649). |
| **S6** | ✅ DONE | **Extract handler functions from routers** — Created `src/handlers/agents.ts` (11 handlers), `src/handlers/chats.ts` (4 handlers), `src/handlers/workspaces.ts` (18 handlers). All handlers use `fanOutToAllHosts`, `fanOutToFirstHost`, `fanOutToSpecificHost` from `fanout.ts` instead of inline fan-out loops. Validation uses `requireParam`/`requireQuery`/`requireField` helpers. Router files (`routes/agents.ts`, `routes/chats.ts`, `routes/workspaces.ts`) shrunk from 1195 total lines to 88 lines (just path→handler wiring). All 234 tests green. |
| **S7** | ✅ DONE | **Add centralized error middleware** — Created `src/error-handler.ts` with `AppError`/`BadRequestError`/`NotFoundError` classes, `asyncHandler()` wrapper for Express, and `errorHandler` middleware. All handlers now throw errors instead of manually setting `res.status().json()`. Added `errorHandler` to `app.ts`. Validation helpers (`requireParam`/`requireQuery`/`requireField`) changed to throw-based API. Handlers use `fanOutTo*` helpers, throw `BadRequestError`/`NotFoundError`/`NoHostsError`/`FanOutError`, and bubble up to error middleware. Only 3 handlers retain try/catch for special error classification logic. 237 tests green. |
| **S8** | ✅ DONE | **Replace hand-rolled CORS with `cors` package** — Added `cors` npm package, replaced the 8-line manual CORS middleware with `app.use(cors({...}))`. Same behavior (origin `*`, allowed headers `Content-Type`/`X-API-Key`, methods `GET/POST/PUT/DELETE`). 237 tests green. |
| **S9** | ✅ DONE | **Apply auth middleware globally** — Moved `requireAuth(auth)` to global middleware in `app.ts`, applies to all routes after `/health`. Removed `auth` parameter from router factories (`createAgentsRouter`, `createChatsRouter`, `createWorkspacesRouter`). Removed `authMiddleware` from every route definition. Made `agentRouter` a required param in `createApp`. Simplified router files significantly. 237 tests green. |
| **S10** | ✅ DONE | **Add error-handler unit tests** — Created `tests/error-handler.test.ts` with 13 tests covering `BadRequestError`, `NotFoundError`, `AppError`, `FanOutError`, `NoHostsError`, `errorHandler` middleware, and `asyncHandler`. Existing integration tests continue to cover all handlers end-to-end. 250 tests total, all green. |

### Key Design Decisions (pre-decided)

- **Fan-out is a function, not a base class** — Pure function `fanOutToHosts(...)` that takes `registry` + `agentRouter` + request payload. No class hierarchy needed.
- **Keep Express Router pattern** — Use `express.Router()` for domain grouping, not a custom framework. KISS.
- **Handlers are plain async functions** — `(req, res, next) => Promise<void>` — no custom wrapper class. Throws are caught by error middleware.
- **Shared types are interfaces, not Zod schemas** — Start with TS interfaces for type safety. Can add Zod validation later as a separate slice if needed.
- **SSE helper is a function, not a class** — Takes `res`, `streamResult`, and `agentRouter`; handles the full SSE lifecycle. Returns a cleanup function for abort.
- **Domain split follows URL structure** — `agents.ts` = `/api/agents/*`, `chats.ts` = `/api/chats/*` + `/api/workspace-chats/*`, `workspaces.ts` = `/api/workspaces/*`, `health.ts` + `hosts.ts` stay small.

### Files Changed (per slice)

- **S1**: Create `src/fanout.ts`, update `src/routes.ts`
- **S2**: Create `src/api-types.ts`, update `src/routes.ts`
- **S3**: Create `src/sse.ts`, update `src/routes.ts`
- **S4**: Create `src/validate.ts`, update `src/routes.ts`
- **S5**: Create `src/routes/` directory with 5 router files, update `src/routes.ts` → `src/app.ts` (thin `createApp`)
- **S6**: Create `src/handlers/agents.ts`, `src/handlers/chats.ts`, `src/handlers/workspaces.ts` with handler functions using fan-out helpers; update `src/routes/agents.ts`, `src/routes/chats.ts`, `src/routes/workspaces.ts` to thin router wiring
- **S7**: Create `src/error-handler.ts` with `AppError`/`BadRequestError`/`NotFoundError`, `asyncHandler()`, `errorHandler` middleware. Update all handlers to throw errors. Change `requireParam`/`requireQuery`/`requireField` to throw-based. Wire `errorHandler` into `app.ts`. Update validate tests.
- **S8**: Add `cors` package to `package.json`. Replace manual CORS middleware in `src/routes/app.ts` with `cors()`.
- **S9**: Move `requireAuth(auth)` to global middleware in `app.ts`. Remove `auth` param from `createAgentsRouter`/`createChatsRouter`/`createWorkspacesRouter`. Make `agentRouter` required in `createApp`. Remove `authMiddleware` from every route definition. Simplify router files.
- **S7**: Create `src/error-handler.ts`, update handlers, update `src/app.ts`
- **S8**: Update `package.json`, `src/app.ts`
- **S9**: Update `src/app.ts`, update route files
- **S10**: Update `tests/*.test.ts`, potentially add `tests/handlers/*.test.ts`

## 2026-05-06 — Reasoning Tokens in Chat Stats

### Problem

The chat view shows an "In / Out / Context%" stats bar, but reasoning (thinking) tokens are lumped into the "Out" count. For models with `thinking` capability (e.g. qwen3), the user sees inflated output tokens and has no visibility into how many tokens were spent reasoning.

Ollama's API does not report reasoning tokens separately — `eval_count` includes both thinking + output tokens. Our solution: estimate reasoning tokens proportionally from thinking vs text character counts.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **R1** | ✅ DONE | **Add `reasoningTokens` to `AgentRunResult`** — In `agent-runner.ts`, after the agent loop completes, calculate estimated reasoning tokens by proportionally splitting `completionTokens` based on thinking vs text character counts. Add `reasoningTokens` field to `AgentRunResult` interface. Return it alongside `promptTokens`/`completionTokens`. |
| **R2** | ✅ DONE | **Persist `reasoningTokens` in chat-db** — Added `reasoning_tokens` column to messages table and `total_reasoning_tokens` to chats table in both `chat-db.ts` and `workspace-chats-db.ts`. Added `reasoningTokens` to `InsertMessageInput`/`MessageRow`/`AddMessageInput`/`WorkspaceMessageRow` interfaces. Added `totalReasoningTokens` to `ChatRow`/`WorkspaceChatRow`. Migration via `ALTER TABLE ADD COLUMN` wrapped in try/catch for existing DBs. 9 new tests across both DB test files. |
| **R3** | ✅ DONE | **Thread `reasoningTokens` through handlers** — Updated `handleSendMessage` to pass `reasoningTokens` to `chatDb.insertMessage()`. Updated `handleGetChat` to extract `reasoningTokens` from last assistant message and return `totalReasoning`. Updated `handleSendWorkspaceMessage` to pass `reasoningTokens` to `wchatDb.addMessage()`. 3 new tests. |
| **R4** | ✅ DONE | **Add `totalReasoning` to client types & hooks** — Updated `ChatDetail` type to include `totalIn`, `totalOut`, `totalReasoning` fields. Updated `useChatDetail` hook to parse these from the API response. Updated ChatView test mock. |
| **R5** | ✅ DONE | **Display reasoning tokens in ChatView stats bar** — Added `tokensReasoning` prop to `AggregateStatsBar`. Conditionally shows a "Reason" counter between Out and Context (only when `tokensReasoning > 0`). Updated `ChatDetail` type to include `totalIn`, `totalOut`, `totalReasoning`. Updated `useChatDetail` hook to parse these fields. Updated ChatView test mock. |

### Design Decisions

- **Proportional estimation**: `reasoningTokens = round(completionTokens × thinkingChars / totalChars)` where `totalChars = thinkingChars + textChars`. This is an approximation since Ollama doesn't report separate counts. Falls back to `0` if no thinking content.
- **Conditional display**: The "Reason" counter only appears when the model has `thinking` in its capabilities. Hidden entirely for non-reasoning models.
- **Stored as separate column**: `reasoning_tokens` is stored alongside `completion_tokens` in messages, not replacing it. `completion_tokens` still includes reasoning tokens (matching Ollama's `eval_count`).

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