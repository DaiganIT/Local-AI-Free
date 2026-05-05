import { describe, it, expect, beforeEach } from "vitest";
import { createSupervisor } from "../src/agent-supervisor.js";
import type { AgentsDb, AgentRow, CreateAgentInput, UpdateAgentInput } from "../src/agents-db.js";

function fakeAgentsDb(): AgentsDb {
  const agents: Map<string, AgentRow> = new Map();
  let nextId = 0;

  return {
    createAgent(input: CreateAgentInput): AgentRow {
      const id = `agent-${nextId++}`;
      const now = new Date().toISOString();
      const agent: AgentRow = { id, name: input.name, model: input.model, status: "idle", createdAt: now, updatedAt: now };
      agents.set(id, agent);
      return agent;
    },
    getAgent(id: string): AgentRow | undefined {
      return agents.get(id);
    },
    updateAgent(id: string, input: UpdateAgentInput): AgentRow {
      const existing = agents.get(id);
      if (!existing) throw new Error(`Agent not found: ${id}`);
      const updated: AgentRow = { ...existing, ...input, updatedAt: new Date().toISOString() };
      agents.set(id, updated);
      return updated;
    },
    listAgents(): AgentRow[] {
      return Array.from(agents.values());
    },
  };
}

describe("agent-supervisor", () => {
  let db: AgentsDb;
  let supervisor: ReturnType<typeof createSupervisor>;

  beforeEach(() => {
    db = fakeAgentsDb();
    supervisor = createSupervisor(db);
  });

  describe("loadAgents", () => {
    it("starts all existing agents from db", () => {
      db.createAgent({ name: "pi", model: "llama3.2" });
      db.createAgent({ name: "researcher", model: "phi3" });

      supervisor.loadAgents();

      const running = supervisor.listRunningAgents();
      expect(running).toHaveLength(2);
      expect(running.map(a => a.name).sort()).toEqual(["pi", "researcher"].sort());
    });

    it("sets loaded agents to idle status in db", () => {
      const created = db.createAgent({ name: "pi", model: "llama3.2" });

      supervisor.loadAgents();

      expect(db.getAgent(created.id)?.status).toBe("idle");
    });

    it("returns empty when no agents in db", () => {
      supervisor.loadAgents();

      expect(supervisor.listRunningAgents()).toHaveLength(0);
    });
  });

  describe("startAgent", () => {
    it("starts a specific agent by id", () => {
      const created = db.createAgent({ name: "pi", model: "llama3.2" });

      supervisor.startAgent(created.id);

      const running = supervisor.listRunningAgents();
      expect(running).toHaveLength(1);
      expect(running[0].name).toBe("pi");
    });

    it("sets status to idle", () => {
      const created = db.createAgent({ name: "pi", model: "llama3.2" });

      supervisor.startAgent(created.id);

      expect(db.getAgent(created.id)!.status).toBe("idle");
      expect(supervisor.listRunningAgents()[0]!.status).toBe("idle");
    });

    it("throws when agent does not exist", () => {
      expect(() => supervisor.startAgent("non-existent")).toThrow("Agent not found");
    });
  });

  describe("stopAgent", () => {
    it("stops a running agent", () => {
      const created = db.createAgent({ name: "pi", model: "llama3.2" });
      supervisor.startAgent(created.id);

      supervisor.stopAgent(created.id);

      expect(supervisor.listRunningAgents()).toHaveLength(0);
    });

    it("throws when agent is not running", () => {
      expect(() => supervisor.stopAgent("non-existent")).toThrow("not running");
    });
  });
});
