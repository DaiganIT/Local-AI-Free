import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import { slugify } from "../src/utils.js";
import Database from "better-sqlite3";

describe("workspaces-db", () => {
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let sqlite: Database.Database;

  beforeEach(() => {
    vi.useFakeTimers();
    sqlite = new Database(":memory:");
    wdb = createWorkspacesDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── slugify ───────────────────────────────────────────────────────────────

  describe("slugify", () => {
    it("converts spaces to hyphens and lowercases", () => {
      expect(slugify("My Workspace")).toBe("my-workspace");
    });

    it("replaces non-alphanumeric runs with a single hyphen", () => {
      expect(slugify("Project #1")).toBe("project-1");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugify("-leading-trailing-")).toBe("leading-trailing");
    });
  });

  // ── table creation ────────────────────────────────────────────────────────

  describe("init", () => {
    it("creates the workspaces table", () => {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'")
        .get();
      expect(table).toBeDefined();
    });

    it("creates the workspace_agents join table", () => {
      const table = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_agents'")
        .get();
      expect(table).toBeDefined();
    });
  });

  // ── createWorkspace ───────────────────────────────────────────────────────

  describe("createWorkspace", () => {
    it("creates a workspace and returns it with id, alias, path, and timestamps", () => {
      const ws = wdb.createWorkspace({ name: "Project Alpha" });

      expect(ws.id).toBeDefined();
      expect(ws.name).toBe("Project Alpha");
      expect(ws.alias).toBe("project-alpha");
      expect(ws.path).toBe("project-alpha");
      expect(ws.createdAt).toBeDefined();
      expect(ws.updatedAt).toBeDefined();
    });

    it("uses explicit path when provided", () => {
      const ws = wdb.createWorkspace({ name: "Project Alpha", path: "custom-path" });
      expect(ws.path).toBe("custom-path");
    });

    it("defaults path to slugified name", () => {
      const ws = wdb.createWorkspace({ name: "My Workspace" });
      expect(ws.path).toBe("my-workspace");
    });

    it("throws on duplicate alias (same name)", () => {
      wdb.createWorkspace({ name: "Unique" });
      expect(() => wdb.createWorkspace({ name: "Unique" })).toThrow();
    });

    it("throws if name is empty", () => {
      expect(() => wdb.createWorkspace({ name: "" })).toThrow();
    });
  });

  // ── getWorkspace ──────────────────────────────────────────────────────────

  describe("getWorkspace", () => {
    it("returns a workspace by id", () => {
      const created = wdb.createWorkspace({ name: "Find Me" });
      const found = wdb.getWorkspace(created.id)!;

      expect(found.id).toBe(created.id);
      expect(found.name).toBe("Find Me");
      expect(found.alias).toBe("find-me");
    });

    it("returns undefined for non-existent id", () => {
      expect(wdb.getWorkspace("no-such-id")).toBeUndefined();
    });
  });

  // ── listWorkspaces ────────────────────────────────────────────────────────

  describe("listWorkspaces", () => {
    it("returns all workspaces ordered by created_at desc", () => {
      const a = wdb.createWorkspace({ name: "First" });
      vi.advanceTimersByTime(1000);
      const b = wdb.createWorkspace({ name: "Second" });
      vi.advanceTimersByTime(1000);
      const c = wdb.createWorkspace({ name: "Third" });

      const list = wdb.listWorkspaces();

      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(c.id);
      expect(list[1].id).toBe(b.id);
      expect(list[2].id).toBe(a.id);
    });

    it("returns empty array when no workspaces exist", () => {
      expect(wdb.listWorkspaces()).toHaveLength(0);
    });
  });

  // ── updateWorkspace ───────────────────────────────────────────────────────

  describe("updateWorkspace", () => {
    it("updates name", () => {
      const created = wdb.createWorkspace({ name: "Old Name" });
      const updated = wdb.updateWorkspace(created.id, { name: "New Name" });

      expect(updated.name).toBe("New Name");
      expect(updated.id).toBe(created.id);
    });

    it("updates path", () => {
      const created = wdb.createWorkspace({ name: "Mover" });
      const updated = wdb.updateWorkspace(created.id, { path: "new-location" });

      expect(updated.path).toBe("new-location");
    });

    it("updates updatedAt timestamp", () => {
      const created = wdb.createWorkspace({ name: "Timer" });
      const before = created.updatedAt;

      vi.advanceTimersByTime(1000);
      const updated = wdb.updateWorkspace(created.id, { name: "Updated" });

      expect(updated.updatedAt).not.toBe(before);
    });

    it("only updates provided fields", () => {
      const created = wdb.createWorkspace({ name: "Keeper", path: "keep-path" });
      const updated = wdb.updateWorkspace(created.id, { name: "Renamed" });

      expect(updated.path).toBe("keep-path");
      expect(updated.name).toBe("Renamed");
    });

    it("throws for non-existent id", () => {
      expect(() => wdb.updateWorkspace("no-such-id", { name: "x" })).toThrow();
    });

    it("does not change alias when name is updated", () => {
      const created = wdb.createWorkspace({ name: "Original" });
      expect(created.alias).toBe("original");
      const updated = wdb.updateWorkspace(created.id, { name: "Renamed" });
      expect(updated.alias).toBe("original"); // alias is immutable
    });
  });

  // ── deleteWorkspace ───────────────────────────────────────────────────────

  describe("deleteWorkspace", () => {
    it("deletes a workspace by id", () => {
      const created = wdb.createWorkspace({ name: "Deleteme" });
      wdb.deleteWorkspace(created.id);
      expect(wdb.getWorkspace(created.id)).toBeUndefined();
    });

    it("throws for non-existent id", () => {
      expect(() => wdb.deleteWorkspace("no-such-id")).toThrow();
    });

    it("cascades and removes workspace_agents entries", () => {
      const ws = wdb.createWorkspace({ name: "Cascade" });
      wdb.addAgentToWorkspace(ws.id, "agent-1");
      wdb.addAgentToWorkspace(ws.id, "agent-2");

      wdb.deleteWorkspace(ws.id);

      expect(wdb.listWorkspaceAgents(ws.id)).toHaveLength(0);
      expect(wdb.listAgentWorkspaces("agent-1")).toHaveLength(0);
    });

    it("does not affect other workspaces", () => {
      const a = wdb.createWorkspace({ name: "Keep" });
      const b = wdb.createWorkspace({ name: "Delete" });
      wdb.deleteWorkspace(b.id);
      expect(wdb.getWorkspace(a.id)).toBeDefined();
      expect(wdb.listWorkspaces()).toHaveLength(1);
    });
  });

  // ── addAgentToWorkspace ───────────────────────────────────────────────────

  describe("addAgentToWorkspace", () => {
    it("adds an agent to a workspace", () => {
      const ws = wdb.createWorkspace({ name: "Team" });
      wdb.addAgentToWorkspace(ws.id, "agent-1");

      const agents = wdb.listWorkspaceAgents(ws.id);
      expect(agents).toEqual(["agent-1"]);
    });

    it("allows adding multiple agents to a workspace", () => {
      const ws = wdb.createWorkspace({ name: "Multi" });
      wdb.addAgentToWorkspace(ws.id, "agent-1");
      wdb.addAgentToWorkspace(ws.id, "agent-2");

      const agents = wdb.listWorkspaceAgents(ws.id);
      expect(agents).toHaveLength(2);
      expect(agents).toContain("agent-1");
      expect(agents).toContain("agent-2");
    });

    it("throws if workspace does not exist", () => {
      expect(() => wdb.addAgentToWorkspace("no-workspace", "agent-1")).toThrow();
    });

    it("silently ignores duplicate (idempotent)", () => {
      const ws = wdb.createWorkspace({ name: "Dup" });
      wdb.addAgentToWorkspace(ws.id, "agent-1");
      wdb.addAgentToWorkspace(ws.id, "agent-1"); // no error

      const agents = wdb.listWorkspaceAgents(ws.id);
      expect(agents).toHaveLength(1);
    });
  });

  // ── removeAgentFromWorkspace ──────────────────────────────────────────────

  describe("removeAgentFromWorkspace", () => {
    it("removes an agent from a workspace", () => {
      const ws = wdb.createWorkspace({ name: "Removal" });
      wdb.addAgentToWorkspace(ws.id, "agent-1");
      wdb.addAgentToWorkspace(ws.id, "agent-2");

      wdb.removeAgentFromWorkspace(ws.id, "agent-1");

      const agents = wdb.listWorkspaceAgents(ws.id);
      expect(agents).toEqual(["agent-2"]);
    });

    it("is idempotent — no error if agent not in workspace", () => {
      const ws = wdb.createWorkspace({ name: "Idempotent" });
      expect(() => wdb.removeAgentFromWorkspace(ws.id, "agent-1")).not.toThrow();
    });
  });

  // ── listWorkspaceAgents ───────────────────────────────────────────────────

  describe("listWorkspaceAgents", () => {
    it("returns agent ids for a workspace", () => {
      const ws = wdb.createWorkspace({ name: "List" });
      wdb.addAgentToWorkspace(ws.id, "agent-a");
      wdb.addAgentToWorkspace(ws.id, "agent-b");

      const agents = wdb.listWorkspaceAgents(ws.id);
      expect(agents).toHaveLength(2);
      expect(agents).toContain("agent-a");
      expect(agents).toContain("agent-b");
    });

    it("returns empty array for workspace with no agents", () => {
      const ws = wdb.createWorkspace({ name: "Empty" });
      expect(wdb.listWorkspaceAgents(ws.id)).toEqual([]);
    });
  });

  // ── listAgentWorkspaces ───────────────────────────────────────────────────

  describe("listAgentWorkspaces", () => {
    it("returns workspace ids that contain the agent", () => {
      const ws1 = wdb.createWorkspace({ name: "Alpha" });
      const ws2 = wdb.createWorkspace({ name: "Beta" });

      wdb.addAgentToWorkspace(ws1.id, "agent-x");
      wdb.addAgentToWorkspace(ws2.id, "agent-x");

      const workspaces = wdb.listAgentWorkspaces("agent-x");
      expect(workspaces).toHaveLength(2);
      expect(workspaces).toContain(ws1.id);
      expect(workspaces).toContain(ws2.id);
    });

    it("returns empty array for agent not in any workspace", () => {
      expect(wdb.listAgentWorkspaces("lonely-agent")).toEqual([]);
    });
  });
});
