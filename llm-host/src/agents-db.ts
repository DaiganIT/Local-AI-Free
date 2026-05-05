import Database from "better-sqlite3";
import { now, uuid, slugify } from "./utils.js";

// ── Public types ──────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "working" | "error" | "resting";

export interface AgentRow {
  id: string;
  name: string;
  alias: string;
  model: string;
  status: AgentStatus;
  tools: string[] | null;
  skills: { name: string; description: string }[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  name: string;
  model: string;
  tools?: string[];
  skills?: { name: string; description: string }[];
}

export interface UpdateAgentInput {
  name?: string;
  model?: string;
  status?: AgentStatus;
  tools?: string[] | null;
  skills?: { name: string; description: string }[] | null;
}

export interface AgentsDb {
  createAgent(input: CreateAgentInput): AgentRow;
  getAgent(id: string): AgentRow | undefined;
  updateAgent(id: string, input: UpdateAgentInput): AgentRow;
  deleteAgent(id: string): void;
  listAgents(): AgentRow[];
}

// ── Internal types from SQLite ────────────────────────────────────────────

interface RawAgent {
  id: string;
  name: string;
  alias: string;
  model: string;
  status: string;
  tools: string | null;
  skills: string | null;
  created_at: string;
  updated_at: string;
}

function toAgent(raw: RawAgent): AgentRow {
  return {
    id: raw.id,
    name: raw.name,
    alias: raw.alias,
    model: raw.model,
    status: raw.status as AgentStatus,
    tools: raw.tools ? raw.tools.split(",") : null,
    skills: raw.skills ? JSON.parse(raw.skills) : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}



// ── Database creation ─────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS agents (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL CHECK(length(name) > 0),
    alias          TEXT UNIQUE NOT NULL,
    model          TEXT NOT NULL CHECK(length(model) > 0),
    status         TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'working', 'error', 'resting')),
    tools          TEXT,
    skills         TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
`;

export { slugify } from "./utils.js";

export function createDatabase(db: Database.Database): AgentsDb {
  db.exec(CREATE_TABLES);

  const insertStmt = db.prepare(
    "INSERT INTO agents (id, name, alias, model, status, tools, skills, created_at, updated_at) VALUES (?, ?, ?, ?, 'idle', ?, ?, ?, ?)"
  );
  const getByIdStmt = db.prepare("SELECT * FROM agents WHERE id = ?");
  const deleteStmt = db.prepare("DELETE FROM agents WHERE id = ?");
  const listStmt = db.prepare("SELECT * FROM agents ORDER BY created_at DESC");

  return {
    createAgent(input: CreateAgentInput): AgentRow {
      const ts = now();
      const id = uuid();
      const alias = slugify(input.name);
      insertStmt.run(
        id,
        input.name,
        alias,
        input.model,
        input.tools ? input.tools.join(",") : null,
        input.skills ? JSON.stringify(input.skills) : null,
        ts,
        ts,
      );
      const raw = getByIdStmt.get(id) as RawAgent;
      return toAgent(raw);
    },

    getAgent(id: string): AgentRow | undefined {
      const raw = getByIdStmt.get(id) as RawAgent | undefined;
      return raw ? toAgent(raw) : undefined;
    },

    // Dynamic UPDATE — only set columns that appear in input
    updateAgent(id: string, input: UpdateAgentInput): AgentRow {
      const existing = getByIdStmt.get(id) as RawAgent | undefined;
      if (!existing) {
        throw new Error(`Agent not found: ${id}`);
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) {
        fields.push("name = ?");
        values.push(input.name);
      }
      if (input.model !== undefined) {
        fields.push("model = ?");
        values.push(input.model);
      }
      if (input.status !== undefined) {
        fields.push("status = ?");
        values.push(input.status);
      }
      if (input.tools !== undefined) {
        fields.push("tools = ?");
        values.push(input.tools !== null ? input.tools.join(",") : null);
      }
      if (input.skills !== undefined) {
        fields.push("skills = ?");
        values.push(input.skills !== null ? JSON.stringify(input.skills) : null);
      }

      fields.push("updated_at = ?");
      values.push(now());
      values.push(id);

      const sql = `UPDATE agents SET ${fields.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values);

      const updated = getByIdStmt.get(id) as RawAgent;
      return toAgent(updated);
    },

    deleteAgent(id: string): void {
      const result = deleteStmt.run(id);
      if (result.changes === 0) {
        throw new Error(`Agent not found: ${id}`);
      }
    },

    listAgents(): AgentRow[] {
      const rows = listStmt.all() as RawAgent[];
      return rows.map(toAgent);
    },
  };
}
