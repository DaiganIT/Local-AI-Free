import type { createSupervisor } from "./agent-supervisor.js";

type Supervisor = ReturnType<typeof createSupervisor>;

export interface StartupDeps {
  supervisor: Supervisor;
  connect: () => Promise<void>;
  onFatalError?: (err: unknown) => void;
}

/**
 * Startup sequence: load agents from DB, then connect to server.
 * If loading fails the connect still happens — the server connection
 * is more important and agents can be loaded later.
 */
export function createStartup(deps: StartupDeps): void {
  const { supervisor, connect, onFatalError } = deps;

  try {
    supervisor.loadAgents();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[startup] Failed to load agents: ${message}`);
  }

  connect().catch(onFatalError);
}
