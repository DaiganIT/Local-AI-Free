import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDatabase } from "../src/agents-db.js";
import { slugify } from "../src/utils.js";
import Database from "better-sqlite3";

describe("agents-db", () => {
  let db: ReturnType<typeof createDatabase>;
  let sqlite: Database.Database;

  beforeEach(() => {
    vi.useFakeTimers();
    sqlite = new Database(":memory:");
    db = createDatabase(sqlite);
  });

  afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("slugify", () => {
    it("converts spaces to hyphens and lowercases", () => {
      expect(slugify("PA 1")).toBe("pa-1");
    });

    it("replaces non-alphanumeric runs with a single hyphen", () => {
      expect(slugify("My Agent #2")).toBe("my-agent-2");
      expect(slugify("Hello/World")).toBe("hello-world");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugify("-leading-trailing-")).toBe("leading-trailing");
    });

    it("collapses consecutive non-alphanumeric into one hyphen", () => {
      expect(slugify("test---multiple")).toBe("test-multiple");
    });

    it("lowercases everything", () => {
      expect(slugify("UPPERCASE")).toBe("uppercase");
    });

    it("trims whitespace-only input", () => {
      expect(slugify("  Spaces  ")).toBe("spaces");
    });
  });

  describe("init", () => {
    it("creates the agents table", () => {
      const tableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
        .get();
      expect(tableExists).toBeDefined();
    });

    it("does NOT have a context_window column", () => {
      const columns = sqlite.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      const hasContextWindow = columns.some((c) => c.name === "context_window");
      expect(hasContextWindow).toBe(false);
    });

    it("does NOT have a system_prompt column", () => {
      const columns = sqlite.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      const hasSystemPrompt = columns.some((c) => c.name === "system_prompt");
      expect(hasSystemPrompt).toBe(false);
    });

    it("has an alias column with UNIQUE constraint", () => {
      const columns = sqlite.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      const hasAlias = columns.some((c) => c.name === "alias");
      expect(hasAlias).toBe(true);
    });
  });

  describe("createAgent", () => {
    it("creates an agent and returns it with id, alias, and timestamps", () => {
      const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("PA 1");
      expect(agent.alias).toBe("pa-1");
      expect(agent.model).toBe("llama3.2");
      expect(agent.status).toBe("idle");
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    });

    it("throws on duplicate alias (same name)", () => {
      db.createAgent({ name: "PA 1", model: "llama3.2" });
      expect(() => db.createAgent({ name: "PA 1", model: "phi3" })).toThrow();
    });

    it("throws if name is empty", () => {
      expect(() => db.createAgent({ name: "", model: "llama3.2" })).toThrow();
    });

    it("throws if model is empty", () => {
      expect(() => db.createAgent({ name: "Test", model: "" })).toThrow();
    });

    it("accepts optional tools, skills", () => {
      const agent = db.createAgent({
        name: "Assistant",
        model: "llama3.2",
        tools: ["read", "bash"],
        skills: [{ name: "web-search", description: "Search the web" }],
      });

      expect(agent.tools).toEqual(["read", "bash"]);
      expect(agent.skills).toEqual([{ name: "web-search", description: "Search the web" }]);
    });

    it("allows creating agent without metadata fields", () => {
      const agent = db.createAgent({ name: "Minimal", model: "llama3.2" });

      expect(agent.tools).toBeNull();
      expect(agent.skills).toBeNull();
    });

    it("stores tools as comma-separated string in DB", () => {
      db.createAgent({ name: "Toolcheck", model: "llama3.2", tools: ["read", "bash", "edit"] });
      const raw = sqlite.prepare("SELECT tools FROM agents WHERE name = ?").get("Toolcheck") as { tools: string | null };
      expect(raw.tools).toBe("read,bash,edit");
    });
  });

  describe("getAgent", () => {
    it("returns an agent by id including alias", () => {
      const created = db.createAgent({ name: "Coder Bot", model: "phi3" });
      const found = db.getAgent(created.id)!;

      expect(found.id).toBe(created.id);
      expect(found.name).toBe("Coder Bot");
      expect(found.alias).toBe("coder-bot");
      expect(found.model).toBe("phi3");
    });

    it("returns undefined for non-existent id", () => {
      const found = db.getAgent("non-existent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("updateAgent", () => {
    it("updates name and model", () => {
      const created = db.createAgent({ name: "Old Name", model: "old-model" });
      const updated = db.updateAgent(created.id, { name: "New Name", model: "new-model" });

      expect(updated.name).toBe("New Name");
      expect(updated.model).toBe("new-model");
      expect(updated.id).toBe(created.id);
    });

    it("updates status", () => {
      const created = db.createAgent({ name: "Worker", model: "llama3.2" });
      const updated = db.updateAgent(created.id, { status: "working" });

      expect(updated.status).toBe("working");
    });

    it("updates updatedAt timestamp", () => {
      const created = db.createAgent({ name: "Timer", model: "llama3.2" });
      const before = created.updatedAt;

      vi.advanceTimersByTime(1000);

      const updated = db.updateAgent(created.id, { name: "Updated" });

      expect(updated.updatedAt).not.toBe(before);
    });

    it("only updates provided fields", () => {
      const created = db.createAgent({ name: "Keeper", model: "llama3.2" });
      const updated = db.updateAgent(created.id, { model: "phi3" });

      expect(updated.name).toBe("Keeper"); // unchanged
      expect(updated.model).toBe("phi3");
    });

    it("throws for non-existent id", () => {
      expect(() => db.updateAgent("no-such-id", { name: "x" })).toThrow();
    });

    it("updates tools", () => {
      const created = db.createAgent({ name: "Test", model: "llama3.2" });
      const updated = db.updateAgent(created.id, {
        tools: ["write", "edit"],
      });
      expect(updated.tools).toEqual(["write", "edit"]);
    });

    it("sets tools to null when explicitly passed", () => {
      const created = db.createAgent({
        name: "Test",
        model: "llama3.2",
        tools: ["read"],
      });
      const updated = db.updateAgent(created.id, { tools: null });
      expect(updated.tools).toBeNull();
    });

    it("updates skills", () => {
      const created = db.createAgent({ name: "Test", model: "llama3.2" });
      const updated = db.updateAgent(created.id, {
        skills: [{ name: "frontend-design", description: "UI design" }],
      });
      expect(updated.skills).toEqual([{ name: "frontend-design", description: "UI design" }]);
    });

    it("only updates provided metadata fields", () => {
      const created = db.createAgent({
        name: "Test",
        model: "llama3.2",
        tools: ["read"],
      });
      const updated = db.updateAgent(created.id, { name: "Renamed" });
      expect(updated.tools).toEqual(["read"]);
      expect(updated.name).toBe("Renamed");
    });

    it("does not change alias when name is updated", () => {
      const created = db.createAgent({ name: "Original Name", model: "llama3.2" });
      expect(created.alias).toBe("original-name");
      const updated = db.updateAgent(created.id, { name: "New Name" });
      expect(updated.name).toBe("New Name");
      expect(updated.alias).toBe("original-name"); // alias is immutable
    });
  });

  describe("deleteAgent", () => {
    it("deletes an agent by id", () => {
      const created = db.createAgent({ name: "Deleteme", model: "llama3.2" });
      db.deleteAgent(created.id);
      expect(db.getAgent(created.id)).toBeUndefined();
    });

    it("throws for non-existent id", () => {
      expect(() => db.deleteAgent("no-such-id")).toThrow();
    });

    it("does not affect other agents", () => {
      const a = db.createAgent({ name: "Keep", model: "llama3.2" });
      const b = db.createAgent({ name: "Delete", model: "phi3" });
      db.deleteAgent(b.id);
      expect(db.getAgent(a.id)).toBeDefined();
      expect(db.listAgents()).toHaveLength(1);
    });
  });

  describe("listAgents", () => {
    it("returns all agents ordered by created_at desc", () => {
      const a = db.createAgent({ name: "First", model: "llama3.2" });
      vi.advanceTimersByTime(1000);
      const b = db.createAgent({ name: "Second", model: "phi3" });
      vi.advanceTimersByTime(1000);
      const c = db.createAgent({ name: "Third", model: "mistral" });

      const list = db.listAgents();

      expect(list).toHaveLength(3);
      expect(list[0].id).toBe(c.id);
      expect(list[1].id).toBe(b.id);
      expect(list[2].id).toBe(a.id);
    });

    it("returns empty array when no agents exist", () => {
      expect(db.listAgents()).toHaveLength(0);
    });
  });
});
