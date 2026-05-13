# Progress Log

## Cron Jobs for Agents

### Problem

We need to add scheduled agent runs (cron jobs) so an agent can execute automatically (e.g. every day at 9:00), evaluate a target condition, stop on exit condition, and report based on report condition.

First release requirement:
- Scheduled run creates a **new chat** with the result
- **No push notifications** yet

### Cron Job Definition (V1)

Each cron job must include:
1. **Target condition**
2. **Exit condition**
3. **Target agent**
4. **Report condition**
5. **Schedule** (cron/time)

### Architecture Notes

- **llm-host** is the right place for scheduler + persistence:
  - owns SQLite DB
  - already runs agents
  - can create chats/messages directly
- **server** should relay CRUD/API calls only
- **client** should provide cron-job management UI

### Planned Vertical Slices (host → server → UI)

> Goal: keep each slice reviewable in ~1 PR / small diff.

| # | Status | Description |
|---|--------|-------------|
| **H1** | ✅ DONE | **Host contract types** — Added cron job TS types in `llm-host` (`CronJob`, `CreateCronJobPayload`, `UpdateCronJobPayload`, `CronJobRunResult`, `CronJobRunStatus`). Test added: `llm-host/tests/cron-job-types.test.ts`. |
| **H2** | ✅ DONE | **Host DB: `cron_jobs` table** — Added `llm-host/src/cron-jobs-db.ts` with CRUD + enable/disable + `nextRunAt` support. Tests added in `llm-host/tests/cron-jobs-db.test.ts` (create/list/get/update/delete + required-field validation). |
| **H2b** | ✅ DONE | **Host run logs persistence (DB + disk)** — Added `cron_job_runs` table + append-only run log API in `llm-host/src/cron-jobs-db.ts`, plus JSONL disk log helper `llm-host/src/cron-job-log-file.ts` writing to `.agents/<agent-alias>/cron-log/<jobId>.log`. Option A semantics supported via `logWriteError`. Tests: `llm-host/tests/cron-job-runs-db.test.ts` and `llm-host/tests/cron-job-log-file.test.ts`. |
| **H3** | ✅ DONE | **Host request actions (CRUD only)** — Wired `create/list/update/delete cron-job` actions in `llm-host/src/request-handler.ts` with dedicated handlers in `llm-host/src/handlers/cron-job-handlers.ts` (no scheduler yet). Added host wiring in `llm-host/src/index.ts`. Tests: `llm-host/tests/cron-job-handlers.test.ts`. |
| **H4** | ✅ DONE | **Host scheduler core loop** — Added `llm-host/src/cron-scheduler.ts` with `start/stop`, periodic due-job polling, and per-job in-memory lock to avoid overlapping runs. Tests added in `llm-host/tests/cron-scheduler.test.ts` for due selection and lock behavior. |
| **H5** | ✅ DONE | **Host execution path reuse** — Extracted shared agent-chat execution service in `llm-host/src/run-agent-chat.ts` (prompt run + chat persistence), and refactored `send-message` to use it. Added parity tests in `llm-host/tests/run-agent-chat.test.ts` for auto-created chat persistence and existing-history behavior. |
| **H6** | ⏳ TODO | **Scheduler run creates new chat** — On due job: build prompt from conditions, run agent with no chatId, persist run metadata (`lastRunAt`, `nextRunAt`, optional run row). Integration test: one due job => one new chat. |
| **H7** | ⏳ TODO | **Host startup wiring** — Start scheduler in `index.ts` after DB init; stop on process teardown path if available. Test: scheduler bootstraps without websocket traffic. |
| **S1** | ⏳ TODO | **Server API types + routes (read/create)** — Add relay endpoints `GET/POST /api/agents/:agentId/cron-jobs` and fanout to host actions. Tests for happy path + missing fields. |
| **S2** | ⏳ TODO | **Server routes (update/delete/toggle)** — Add `PUT/DELETE` (+ enable/disable via update) endpoints and error mapping. Tests for 404 host missing, 400 bad payload, success responses. |
| **S3** | ⏳ TODO | **Server route registration/auth coverage** — Ensure new routes are mounted and protected like existing APIs. Add route/auth tests. |
| **U1** | ⏳ TODO | **UI types + hooks (list/create)** — Add client types and hooks for list/create cron jobs. Tests for fetch/mutation behavior and query invalidation. |
| **U2** | ⏳ TODO | **UI panel (read-only list)** — Add “Scheduled Jobs” section in agent detail view with loading/empty/error states. Snapshot/render test. |
| **U3** | ⏳ TODO | **UI create flow** — Minimal form for schedule + 4 required conditions, submit to create, optimistic refresh. Tests for validation + successful create. |
| **U4** | ⏳ TODO | **UI edit/delete/enable-disable** — Add row actions to update or disable a job. Tests for action handlers and list refresh. |
| **E1** | ⏳ TODO | **End-to-end smoke slice** — Create job via API/UI path, force due run (test clock), verify new chat appears for target agent. |
| **D1** | ⏳ TODO | **Docs + env notes** — Update README/.env examples and behavior notes (no notifications in V1). |

### Open Decisions (must be confirmed before implementation)

1. **Schedule format**: full cron expression vs simplified daily/weekly UI
2. **Timezone policy**: host-local timezone vs per-job timezone
3. **Report condition semantics**: always report vs only-if-issue vs custom condition
4. **Missed runs** (host offline): skip vs execute-on-restart

### Example Target Behavior

Input:
- "Every day at 9am explore the London Tube API and tell me if something is wrong with my trip"

Result (V1):
- A scheduled job runs daily at 9am
- It executes the configured agent with the cron job conditions
- It creates a **new chat** containing the update
- No user notifications in first release

### Latest Update

- ✅ Completed **H5** (host execution path reuse)
- ✅ Added shared service `llm-host/src/run-agent-chat.ts` to centralize:
  - system prompt loading
  - conversation reconstruction
  - attachment/image prompt enrichment
  - provider routing
  - agent execution + assistant persistence
- ✅ Refactored `llm-host/src/handlers/send-message.ts` to call `runAgentChat()` while keeping API behavior unchanged
- ✅ Added parity tests in `llm-host/tests/run-agent-chat.test.ts` (new-chat persistence + existing-history reuse)
- ✅ Kept related suites green (`npm test -- run-agent-chat.test.ts`, `npm test -- send-message.test.ts`, `npm test -- cron- run-agent-chat.test.ts`)
- ▶️ Next slice: **H6** (scheduler run creates new chat)
