# Extensions System — Plan

## Overview

Extensions are dynamically created UI components that users can slot into the app. They are created mid-conversation by the LLM via tool calls, stored in the database, and rendered in sandboxed iframes at runtime (React + Babel pre-loaded, no server compilation needed).

The first extension type is **file visualiser** — it overrides the default file viewer when a file is opened in chat, receives the file content via `postMessage`, and renders a custom visualization.

## Architecture Decisions

- **Rendering**: Sandboxed `<iframe>` with React + `@babel/standalone` pre-loaded in the browser. The stored `code` string is compiled client-side and executed. No server build step.
- **Data injection**: File content is passed into the iframe via `postMessage`. No size limit concerns for typical CSV files.
- **Creation**: LLM uses a `create_extension` tool call mid-conversation. The llm-host POSTs to the server, which persists it.
- **Editing**: LLM uses an `update_extension` tool call in any subsequent conversation.
- **Multiple extensions per type**: Supported. For now, the first enabled extension matching the file type is used (Android-style selector deferred).
- **Scope**: Extensions are global (not per-chat). Enabled/disabled globally in Settings.

## DB Schema

```sql
CREATE TABLE extensions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,         -- e.g. 'file_visualiser'
  code        TEXT NOT NULL,         -- React component source (JSX string)
  file_types  TEXT NOT NULL,         -- JSON array e.g. '["csv","tsv"]'
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
```

## Slices

| # | Status | Description |
|---|--------|-------------|
| **EX1** | ⬜ TODO | **DB + Server: extensions table and CRUD API** — Add `extensions` table. Implement `GET /extensions`, `POST /extensions`, `PUT /extensions/:id`, `DELETE /extensions/:id` on the server. |
| **EX2** | ⬜ TODO | **LLM-host: `create_extension` tool call** — Define the tool (`name`, `type`, `code`, `file_types`). Handle it in the agent-runner: POST to server, return a confirmation message into the conversation. |
| **EX3** | ⬜ TODO | **LLM-host: `update_extension` tool call** — Define the tool (`id`, `code`). Handle it: PUT to server, return confirmation. |
| **EX4** | ⬜ TODO | **Client Settings: extensions management UI** — Add an Extensions section to Settings. List all extensions with name, type, file_types, and an enable/disable toggle. |
| **EX5** | ⬜ TODO | **Client: file visualiser activation** — When a file is shown in chat, find the first active `file_visualiser` extension matching the file extension. Render a sandboxed iframe with React + Babel pre-loaded. Inject file content via `postMessage`. |
