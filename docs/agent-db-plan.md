# Agent DB Plan

The llm-host tracks agents (long-running processes) and their conversations via a local SQLite database.

## SQLite Schema

### `agents`

| Column     | Type              | Constraints             | Notes                                    |
| ---------- | ----------------- | ----------------------- | ---------------------------------------- |
| `id`       | TEXT              | PRIMARY KEY             | UUID                                     |
| `name`     | TEXT              | NOT NULL                | User-assigned name                       |
| `model`    | TEXT              | NOT NULL                | Current/default model                    |
| `status`   | TEXT              | NOT NULL                | `idle` \| `working` \| `error` \| `resting` |
| `created_at` | TEXT            | NOT NULL                | ISO 8601                                 |
| `updated_at` | TEXT            | NOT NULL                | ISO 8601                                 |

### `chats`

| Column                  | Type    | Constraints        | Notes                                      |
| ----------------------- | ------- | ------------------ | ------------------------------------------ |
| `id`                    | TEXT    | PRIMARY KEY        | UUID                                       |
| `agent_id`              | TEXT    | NOT NULL           | FK → agents.id                             |
| `title`                 | TEXT    |                    | Auto-generated from first user message or user-controlled |
| `created_at`            | TEXT    | NOT NULL           | ISO 8601                                   |
| `updated_at`            | TEXT    | NOT NULL           | ISO 8601                                   |
| `total_prompt_tokens`   | INTEGER | DEFAULT 0          | Running sum (cached, updated per message)  |
| `total_completion_tokens` | INTEGER | DEFAULT 0        | Running sum (cached, updated per message)  |
| `total_tokens`          | INTEGER | DEFAULT 0          | Running sum (cached, updated per message)  |

### `messages`

| Column                | Type    | Constraints        | Notes                                   |
| --------------------- | ------- | ------------------ | --------------------------------------- |
| `id`                  | TEXT    | PRIMARY KEY        | UUID                                    |
| `chat_id`             | TEXT    | NOT NULL           | FK → chats.id                           |
| `role`                | TEXT    | NOT NULL           | `user` \| `assistant` \| `system`       |
| `content`             | TEXT    | NOT NULL           | Full message body                       |
| `model_used`          | TEXT    | NOT NULL           | Model that processed this message       |
| `prompt_tokens`       | INTEGER |                    | I/O in for this message                 |
| `completion_tokens`   | INTEGER |                    | I/O out for this message                |
| `total_tokens`        | INTEGER |                    | Sum for this message                    |
| `created_at`          | TEXT    | NOT NULL           | ISO 8601                                |

### Indexes

```sql
CREATE INDEX idx_chats_agent_date ON chats(agent_id, updated_at DESC);
CREATE INDEX idx_messages_chat_date ON messages(chat_id, created_at);
```

### Notes

- **`total_tokens` in `chats`** is cached (denormalized) for display performance, updated on each message insert.
- **No retention policy** — all data kept indefinitely.
- **Model can change per message** — stored in `messages.model_used`, editable at the agent level.
- Agent status can be changed even on running agents (edit name, model, etc.).

---

## Slices

### Phase 1: Agents

| Slice | Description | Scope |
| ----- | ----------- | ----- |
| **1a** | SQLite schema + DB module (init, createAgent, getAgent, updateAgent, listAgents) | `llm-host/` — tests first |
| **1b** | Relay server: agent endpoints (list, get, start, stop, edit, delete). Protocol additions between server ↔ llm-host for agent lifecycle | `server/` + `llm-host/` protocol |
| **1c** | UI: agent list, start agent, stop agent, edit agent, delete agent | `client/` |

### Phase 2: Chats

| Slice | Description | Scope |
| ----- | ----------- | ----- |
| **2a** | Chat DB module (createChat, listChats, getChat, deleteChat, insert message with token tracking + update chat totals) | `llm-host/` — tests first |
| **2b** | Relay server: chat endpoints + send-message proxy to llm-host. Protocol additions | `server/` + `llm-host/` |
| **2c** | UI: chat list, chat view, message send, token display | `client/` |

---

## Relay Server Endpoints (for Phase 1b + 2b)

- `GET /api/agents` — list of agents with status
- `GET /api/agents/:id` — agent with status and info
- `POST /api/agents` — start a new agent
- `PUT /api/agents/:id` — edit agent (name, model, etc.)
- `DELETE /api/agents/:id` — stop/delete agent
- `GET /api/agents/:id/chats` — agent's chats (ordered by date desc)
- `GET /api/chats` — all chats (ordered by date desc)
- `POST /api/agents/:id/chats` — create chat with agent
- `GET /api/chats/:id` — chat detail (list of messages, tokens, etc.)
- `POST /api/chats/:id/messages` — send message to agent
- `DELETE /api/chats/:id` — delete chat
