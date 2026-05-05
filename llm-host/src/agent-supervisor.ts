import type { AgentsDb, AgentRow } from "./agents-db.js";

export interface RunningAgent {
  id: string;
  name: string;
  model: string;
  status: "idle" | "working" | "error" | "resting";
}

export function createSupervisor(db: AgentsDb) {
  const running = new Map<string, RunningAgent>();

  function toRunning(agent: AgentRow): RunningAgent {
    return {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      status: agent.status,
    };
  }

  return {
    /** Load all agents from the database into the running set. */
    loadAgents(): void {
      const agents = db.listAgents();
      for (const a of agents) {
        db.updateAgent(a.id, { status: "idle" });
        a.status = "idle";
        running.set(a.id, toRunning(a));
      }
    },

    /** Start a specific agent by its database id. */
    startAgent(id: string): void {
      const agent = db.getAgent(id);
      if (!agent) {
        throw new Error(`Agent not found: ${id}`);
      }
      db.updateAgent(id, { status: "idle" });
      agent.status = "idle";
      running.set(id, toRunning(agent));
    },

    /** Stop a running agent and remove it from the running set. */
    stopAgent(id: string): void {
      const agent = running.get(id);
      if (!agent) {
        throw new Error(`Agent not running: ${id}`);
      }
      db.updateAgent(id, { status: "idle" });
      running.delete(id);
    },

    listRunningAgents(): RunningAgent[] {
      return Array.from(running.values());
    },
  };
}
