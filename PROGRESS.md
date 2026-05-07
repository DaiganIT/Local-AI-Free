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
