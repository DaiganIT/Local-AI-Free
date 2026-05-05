# Progress Log

## 2026-05-05 — Open Source Release

### Goal
Convert the project from three separate git repos into a monorepo, fix port conflicts, add docs, and make it ready for open-source release under Polyform Noncommercial license.

### Slices

| # | Status | Description |
|---|--------|-------------|
| **O1** | ⬜ TODO | **Fix port defaults** — Server stays at 3000, client moves to 4000 (dev port), update .env.example files accordingly |
| **O2** | ⬜ TODO | **Make Ollama a soft requirement** — If Ollama is unreachable on startup, print helpful message with install URL instead of crashing. llm-host stays running, reports 0 models. |
| **O3** | ⬜ TODO | **Convert to monorepo** — Init root git repo, merge three repo histories, set up npm workspaces, root scripts for install/build/test/dev |
| **O4** | ⬜ TODO | **Add Polyform Noncommercial LICENSE** |
| **O5** | ⬜ TODO | **Write README.md** — Project overview, architecture, prerequisites (Ollama), quickstart, dev setup, env vars |
| **O6** | ⬜ TODO | **Write CONTRIBUTING.md** — Dev setup, how to run tests, PR process |
| **O7** | ⬜ TODO | **Add root .gitignore, clean up** — Remove pi-readme.md, markitdown-readme.md, empty root package.json/package-lock.json |

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