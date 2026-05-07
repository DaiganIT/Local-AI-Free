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
| **P4** | ✅ DONE | **Update protocol: add `provider` to `ModelInfo` + add `providers` to register** — Each `ModelInfo` now carries a `provider` field. `RegisterMessage` uses `providers: {name, version}[]` instead of `ollamaVersion`. Heartbeat unchanged. Updated all types in `protocol.ts`, `server/types.ts`, `providers/types.ts`, registry, ws-handler, and all 40+38=78 tests pass. |
| **P5** | ✅ DONE | **Wire into `index.ts`** — Replaced direct `getOllamaVersion`/`getOllamaModels` calls with `collectProviders`, `fetchAllModels`, and `discoverProviders` from `providers/discovery.ts`. Providers configured via `LLM_PROVIDERS` env var (defaults to `"ollama"`). 6 new discovery tests + all existing tests pass. |
| **P6** | ✅ DONE | **Update server `registry.ts` + `types.ts`** — `HostInfo` now stores `providers: {name, version}[]` instead of `ollamaVersion`. All server-source references to `ollamaVersion` removed. All 12 server test files with HostInfo mocks updated. All 251 server tests pass. |
