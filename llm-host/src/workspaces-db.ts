import Database from "better-sqlite3";
import { now, uuid, slugify } from "./utils.js";

// ── Public types ──────────────────────────────────────────────────────────

export interface WorkspaceRow {
  id: string;
  name: string;
  alias: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  path?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  path?: string;
}

export interface WorkspacesDb {
  createWorkspace(input: CreateWorkspaceInput): WorkspaceRow;
  getWorkspace(id: string): WorkspaceRow | undefined;
  listWorkspaces(): WorkspaceRow[];
  updateWorkspace(id: string, input: UpdateWorkspaceInput): WorkspaceRow;
  deleteWorkspace(id: string): void;
  addAgentToWorkspace(workspaceId: string, agentId: string): void;
  removeAgentFromWorkspace(workspaceId: string, agentId: string): void;
  listWorkspaceAgents(workspaceId: string): string[];
  listAgentWorkspaces(agentId: string): string[];
}

// ── Internal types from SQLite ────────────────────────────────────────────

interface RawWorkspace {
  id: string;
  name: string;
  alias: string;
  path: string;
  created_at: string;
  updated_at: string;
}

function toWorkspace(raw: RawWorkspace): WorkspaceRow {
  return {
    id: raw.id,
    name: raw.name,
    alias: raw.alias,
    path: raw.path,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}



export { slugify } from "./utils.js";

// ── Database creation ─────────────────────────────────────────────────────

const CREATE_WORKSPACES_TABLE = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL CHECK(length(name) > 0),
    alias       TEXT UNIQUE NOT NULL,
    path        TEXT NOT NULL CHECK(length(path) > 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
`;

const CREATE_WORKSPACE_AGENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS workspace_agents (
    workspace_id  TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    PRIMARY KEY (workspace_id, agent_id)
  );
`;

export function createWorkspacesDatabase(db: Database.Database): WorkspacesDb {
  db.exec(CREATE_WORKSPACES_TABLE);
  db.exec(CREATE_WORKSPACE_AGENTS_TABLE);

  // ── Prepared statements ────────────────────────────────────────────────

  const insertWorkspaceStmt = db.prepare(
    "INSERT INTO workspaces (id, name, alias, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const getWorkspaceStmt = db.prepare("SELECT * FROM workspaces WHERE id = ?");
  const listWorkspacesStmt = db.prepare("SELECT * FROM workspaces ORDER BY created_at DESC");
  const deleteWorkspaceStmt = db.prepare("DELETE FROM workspaces WHERE id = ?");

  const addAgentStmt = db.prepare(
    "INSERT OR IGNORE INTO workspace_agents (workspace_id, agent_id) VALUES (?, ?)"
  );
  const removeAgentStmt = db.prepare(
    "DELETE FROM workspace_agents WHERE workspace_id = ? AND agent_id = ?"
  );
  const listWorkspaceAgentsStmt = db.prepare(
    "SELECT agent_id FROM workspace_agents WHERE workspace_id = ?"
  );
  const listAgentWorkspacesStmt = db.prepare(
    "SELECT workspace_id FROM workspace_agents WHERE agent_id = ?"
  );

  // Cascade: delete all workspace_agents rows when a workspace is deleted
  const deleteWorkspaceAgentsStmt = db.prepare(
    "DELETE FROM workspace_agents WHERE workspace_id = ?"
  );

  return {
    createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
      const ts = now();
      const id = uuid();
      const alias = slugify(input.name);
      const path = input.path ?? alias;
      insertWorkspaceStmt.run(id, input.name, alias, path, ts, ts);
      const raw = getWorkspaceStmt.get(id) as RawWorkspace;
      return toWorkspace(raw);
    },

    getWorkspace(id: string): WorkspaceRow | undefined {
      const raw = getWorkspaceStmt.get(id) as RawWorkspace | undefined;
      return raw ? toWorkspace(raw) : undefined;
    },

    listWorkspaces(): WorkspaceRow[] {
      const rows = listWorkspacesStmt.all() as RawWorkspace[];
      return rows.map(toWorkspace);
    },

    updateWorkspace(id: string, input: UpdateWorkspaceInput): WorkspaceRow {
      const existing = getWorkspaceStmt.get(id) as RawWorkspace | undefined;
      if (!existing) {
        throw new Error(`Workspace not found: ${id}`);
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) {
        fields.push("name = ?");
        values.push(input.name);
      }
      if (input.path !== undefined) {
        fields.push("path = ?");
        values.push(input.path);
      }

      fields.push("updated_at = ?");
      values.push(now());
      values.push(id);

      const sql = `UPDATE workspaces SET ${fields.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values);

      const updated = getWorkspaceStmt.get(id) as RawWorkspace;
      return toWorkspace(updated);
    },

    deleteWorkspace(id: string): void {
      // Cascade: remove all agent associations first
      deleteWorkspaceAgentsStmt.run(id);

      const result = deleteWorkspaceStmt.run(id);
      if (result.changes === 0) {
        throw new Error(`Workspace not found: ${id}`);
      }
    },

    addAgentToWorkspace(workspaceId: string, agentId: string): void {
      const ws = getWorkspaceStmt.get(workspaceId) as RawWorkspace | undefined;
      if (!ws) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      addAgentStmt.run(workspaceId, agentId);
    },

    removeAgentFromWorkspace(workspaceId: string, agentId: string): void {
      removeAgentStmt.run(workspaceId, agentId);
    },

    listWorkspaceAgents(workspaceId: string): string[] {
      const rows = listWorkspaceAgentsStmt.all(workspaceId) as { agent_id: string }[];
      return rows.map((r) => r.agent_id);
    },

    listAgentWorkspaces(agentId: string): string[] {
      const rows = listAgentWorkspacesStmt.all(agentId) as { workspace_id: string }[];
      return rows.map((r) => r.workspace_id);
    },
  };
}
