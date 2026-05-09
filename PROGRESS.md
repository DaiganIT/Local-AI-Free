# Progress Log

## Multi-Provider Model Discovery

### Problem

The llm-host currently only supports Ollama for discovering available LLM models. When Ollama isn't running, the host registers with 0 models. We need to support additional providers (e.g., MLX via `mlx-omni-server`) with a common interface, and gracefully handle unreachable providers without crashing. Each model should carry its provider name so the server and client know where it came from.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **P1** | ✅ DONE | **`ModelProvider` interface + rename `OllamaModel` → `ModelInfo`** — Defined `ModelProvider` interface in `src/providers/types.ts`. Renamed `OllamaModel` → `ModelInfo` in `protocol.ts`, `ollama.ts`, `heartbeat.ts`, `server/src/types.ts`, `server/src/registry.ts`, and all corresponding tests. All 33 relevant tests pass (23 llm-host + 10 server). |
| **P2** | ✅ DONE | **`OllamaProvider` implements `ModelProvider`** — Created `OllamaProvider` class in `src/providers/ollama-discovery.ts` with same logic as `ollama.ts` (version via `/api/version`, models via `/api/tags` + `/api/show`). 8 new tests pass; existing `ollama.ts` exports still work. |
| **P3** | ✅ DONE | **`MlxProvider` implements `ModelProvider`** — Created `MlxProvider` in `src/providers/mlx-discovery.ts`. Discovers models via `/v1/models` (OpenAI-compatible); version reports `"mlx-omni-server"` when reachable. Unreachable → `{reachable:false, version:"unknown"}`, models `[]`. 8 tests pass. |
| **P4** | ✅ DONE | **Update protocol: add `provider` to `ModelInfo` + add `providers` to register** — Each `ModelInfo` now carries a `provider` field. `RegisterMessage` uses `
{name, version}[]` instead of `ollamaVersion`. Heartbeat unchanged. Updated all types in `protocol.ts`, `server/types.ts`, `providers/types.ts`, registry, ws-handler, and all 40+38=78 tests pass. |
| **P5** | ✅ DONE | **Wire into `index.ts`** — Replaced direct `getOllamaVersion`/`getOllamaModels` calls with `collectProviders`, `fetchAllModels`, and `discoverProviders` from `providers/discovery.ts`. Providers configured via `LLM_PROVIDERS` env var (defaults to `"ollama"`). 6 new discovery tests + all existing tests pass. |
| **P6** | ✅ DONE | **Update server `registry.ts` + `types.ts`** — `HostInfo` now stores `providers: {name, version}[]` instead of `ollamaVersion`. All server-source references to `ollamaVersion` removed. All 12 server test files with HostInfo mocks updated. All 251 server tests pass. |

## Provider Online Status in Client UI

### Problem

The client types are out of sync with the server — `HostInfo` still uses `ollamaVersion: string` and `OllamaModel` lacks `provider`. Additionally, the client doesn't derive agent online/offline status from provider reachability. An agent should be shown as offline when its provider is unreachable (e.g., Ollama not running → no models listed → agent offline).

### Rule

> **An agent is online only if** its host is online **AND** its model name is found in that host's `models` array. Otherwise → offline.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **S1** | ✅ DONE | **Fix client `types.ts`** — Rename `OllamaModel` → `ModelInfo` (add `provider` field). Replace `HostInfo.ollamaVersion` with `providers: {name, version}[]`. Fix all client references and tests. |
| **S2** | ✅ DONE | **Derive agent `provider` and `status` from host data** — In `useAgents()` / `useAgent()`, cross-reference each agent's `model` against its host's `models` to derive `provider` and compute online/offline based on the rule above. |
| **S3** | ✅ DONE | **Show provider online status in the UI** — Update `ServerBar`, agent cards, and any model badges to reflect provider-derived online/offline state (green/gray dot, model badge with provider info). |

## Auto-Discover All Providers (no `LLM_PROVIDERS` env var)

### Problem

The llm-host requires `LLM_PROVIDERS` env var to select which providers to try. The user has `omlx` (a newer MLX server on port 8000) in addition to the existing `mlx-omni-server` support. All providers should be auto-detected — if reachable, they show up. No manual env var for which providers to enable.

Each provider's host, port, and API key should still be configurable via `.env` (e.g. `OMLX_HOST`, `OMLX_API_KEY`).

### Slices

| # | Status | Description |
|---|--------|-------------|
| **A1** | ✅ DONE | **Create `OmlxProvider`** — New `providers/omlx-discovery.ts`. `version()` hits `/health` (no auth), `models()` hits `/v1/models` with optional `OMLX_API_KEY` as Bearer token. Configurable via `OMLX_HOST` env (default `http://localhost:8000`). 11 tests pass. |
| **A2** | ✅ DONE | **Auto-discover all providers** — Changed `discovery.ts`: replaced `collectProviders(providerNames)` with `autoDiscoverProviders()`. Instantiates all known providers (ollama, mlx, omlx), checks each reachability, returns only reachable ones. No env var needed for provider selection. 6 tests pass. |
| **A3** | ✅ DONE | **Remove `LLM_PROVIDERS` from `index.ts`** — Uses `autoDiscoverProviders()` inside `connect()`. No `LLM_PROVIDERS` env var. All existing tests pass. |

## LM Studio Provider

### Problem

LM Studio is a popular desktop app for running local LLMs. It exposes an OpenAI-compatible API on port 1234 by default. We should auto-discover it alongside the other providers.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **L1** | ✅ DONE | **Create `LmStudioProvider`** — New `providers/lm-studio-discovery.ts`. `version()` hits `/v1/models` for reachability (same pattern as `MlxProvider`). `models()` parses the OpenAI `/v1/models` format. Configurable via `LM_STUDIO_HOST` env (default `http://localhost:1234`). 9 tests pass. |
| **L2** | ✅ DONE | **Wire into `discovery.ts`** — Added `LmStudioProvider` to `autoDiscoverProviders()` so it's automatically detected at startup. |

## Multi-Provider Message Routing

### Problem

When `send-message` is called, the host always routes to Ollama (`http://localhost:11434`) regardless of which provider actually serves the model. The `create-agent` endpoint stores the model name (e.g. `"Qwen3.6-35B-A3B-UD-MLX-4bit"`) but no provider info, so there's no way for the message handler to know that MLX models should go to port 11435.

The `enrichAgents` function on the client derives provider from host model lists, but this info never reaches the server. We need a **per-name lookup**: match the agent's model name against the discovered models list, find which provider owns it, then use that provider's API endpoint.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **R1** | ✅ DONE | **`createOpenAIModel` factory for `openai-completions` API** — File `src/providers/openai-models.ts` exports `createOpenAIModel({ id, baseUrl, name?, provider?, contextWindow?, maxTokens?, reasoning? })` returning `Model<"openai-completions">`. 13 tests pass. |
| **R2** | ✅ DONE | **`providerRegistry` — model name → provider lookup** — New module `src/providers/provider-registry.ts`. Extends `ModelProvider` interface with `baseUrl` property; all 4 providers (ollama, mlx, omlx, lm-studio) expose `baseUrl` publicly. `initProviderRegistry(providers, models)` called at startup in `index.ts`. Exports `findProviderForModel(modelName)` that matches against cached models → returns `{ provider, baseUrl }`. 9 tests pass. |
| **R3** | ✅ DONE | **Add `provider` field to `AgentRunInput` and route via model-factory registry in `runAgent`** — Added `ModelFactoryOptions` interface, `registerModelFactory()`, and `clearModelFactories()` exports. A `modelFactories` map maps provider names → factory functions; `"ollama"` is registered at module level. In `runAgent`, looks up factory by `input.provider`; found → use it, otherwise → fall back to `createOpenAIModel` (generic OpenAI-compat). No hardcoded `if provider === "ollama"` dispatch. Updated integration tests to pass `provider: "ollama"` explicitly. 7 new registry tests pass. |
| **R4** | ✅ DONE | **Wire `provider` lookup into `send-message.ts`** — In `handleSendMessage`, import `findProviderForModel` from `provider-registry`. Look up provider by `agent.model`. Pass `provider` and correct `baseUrl` in `AgentRunInput`. If provider not found (model not in any discovered list), default to ollama with a warning log. 2 new tests pass (routes to found provider; defaults to ollama when lookup returns undefined). |
| **R5** | ✅ DONE | **Wire `provider` lookup into `workspace-chat-handlers.ts`** — Same as R4: each agent in the parallel list gets its own `findProviderForModel` lookup. Both single-agent and multi-agent paths are fixed in one change. 3 new tests pass (workspace routes to found provider; defaults to ollama when undefined; multi-agent routes each to its own provider). |
| **R6** | ✅ DONE | **Update `handleRequest` interface to pass `findProviderForModel`** — Added `findProviderForModel` to `RequestInput` interface (optional, typed as `(modelName: string) => ProviderLookup | undefined`). Pass it through in `handleRequest` switch cases for `send-message` and `send-workspace-message`. Updated both handlers to receive it as a parameter instead of importing from `provider-registry` directly. Updated `index.ts` caller to pass the real `findProviderForModel`. Tests now inject mock functions via `RequestInput` instead of spying on the module. All 45 send-message tests + 637 total llm-host tests pass. |

### Dependencies

- R1 → R3 (factory before routing)
- R2 → R4, R5 (lookup before usage)
- R6 → R4, R5 (interface before consumers)

### Wire

```
client (enrichAgents derives provider)
    ↓
POST /api/agents  (hostId + name + model)
    ↓
server → fanOutToSpecificHost → POST /api/chat (agentId + prompt)
    ↓
server → fanOutToFirstHost → WebSocket RPC → host
    ↓
host: handleRequest → send-message (findProviderForModel(agent.model))
    ↓
agent-runner.runAgent (dispatch createOllamaModel vs createOpenAIModel)
    ↓
@pi-ai streamOllama or streamOpenAICompletions → actual LLM API
```
