import type { Registry } from "./registry.js";
import type { AgentRouter } from "./agent-router.js";

// ── Error types ──────────────────────────────────────────────────────────────

export class FanOutError extends Error {
  /** HTTP status code to return. Defaults to 502. */
  status: number;
  /** All errors collected from hosts. */
  errors: Error[];

  constructor(message: string, errors: Error[], status = 502) {
    super(message);
    this.name = "FanOutError";
    this.status = status;
    this.errors = errors;
  }
}

export class NoHostsError extends Error {
  constructor() {
    super("no hosts connected");
    this.name = "NoHostsError";
  }
}

// ── fanOutToAllHosts ─────────────────────────────────────────────────────────
// Fan out to ALL hosts in parallel, aggregate results.
// Used for: list-agents, list-workspaces
// Returns array of items with hostId appended to each.
// Throws FanOutError if ALL hosts fail, NoHostsError if no hosts.

export interface FanOutAllOptions {
  action: string;
  payload: unknown;
  /** Field name to stamp on each result item. Defaults to "hostId". */
  hostIdField?: string;
  timeoutMs?: number;
}

export async function fanOutToAllHosts(
  registry: Registry,
  agentRouter: AgentRouter,
  options: FanOutAllOptions
): Promise<Record<string, unknown>[]> {
  const hosts = registry.listHosts();

  if (hosts.length === 0) {
    return [];
  }

  const hostIdField = options.hostIdField ?? "hostId";
  const reqOpts = options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined;
  const allResults: Record<string, unknown>[] = [];
  const errors: Error[] = [];

  await Promise.all(
    hosts.map(async (h) => {
      try {
        const data = await agentRouter.request(h.id, {
          action: options.action,
          payload: options.payload,
        }, reqOpts);
        const items = data as Record<string, unknown>[];
        for (const item of items) {
          allResults.push({ ...item, [hostIdField]: h.id });
        }
      } catch (err) {
        errors.push(err as Error);
      }
    })
  );

  if (allResults.length === 0 && errors.length > 0) {
    throw new FanOutError(
      errors.map((e) => e.message).join(", "),
      errors,
    );
  }

  return allResults;
}

// ── fanOutToFirstHost ────────────────────────────────────────────────────────
// Fan out to hosts sequentially, return the first success.
// Used for: send-message, get-chat, delete-chat, delete-agent,
//           get-agent-instructions, folder-tree, file ops, upload
// Returns { data, hostId } on success.
// Throws NoHostsError if no hosts, FanOutError if all hosts fail.

export interface FanOutFirstOptions {
  action: string;
  payload: unknown;
  timeoutMs?: number;
}

export interface FanOutFirstResult {
  data: unknown;
  hostId: string;
}

export async function fanOutToFirstHost(
  registry: Registry,
  agentRouter: AgentRouter,
  options: FanOutFirstOptions
): Promise<FanOutFirstResult> {
  const hosts = registry.listHosts();

  if (hosts.length === 0) {
    throw new NoHostsError();
  }

  const reqOpts = options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined;
  const errors: Error[] = [];

  for (const h of hosts) {
    try {
      const data = await agentRouter.request(h.id, {
        action: options.action,
        payload: options.payload,
      }, reqOpts);
      return { data, hostId: h.id };
    } catch (err) {
      errors.push(err as Error);
    }
  }

  throw new FanOutError(
    errors.map((e) => e.message).join(", "),
    errors,
  );
}

// ── fanOutToSpecificHost ─────────────────────────────────────────────────────
// Send request to a single specific host.
// Used for: create-agent, create-workspace, add/remove agent to workspace, etc.
// Returns data on success.
// Throws FanOutError(404) if host not found, FanOutError(400) if host rejects.

export interface FanOutSpecificOptions {
  action: string;
  payload: unknown;
  timeoutMs?: number;
}

export async function fanOutToSpecificHost(
  registry: Registry,
  agentRouter: AgentRouter,
  hostId: string,
  options: FanOutSpecificOptions
): Promise<unknown> {
  const hosts = registry.listHosts();
  const host = hosts.find((h) => h.id === hostId);

  if (!host) {
    throw new FanOutError(
      `host '${hostId}' not found or not connected`,
      [],
      404,
    );
  }

  const reqOpts = options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined;

  try {
    return await agentRouter.request(hostId, {
      action: options.action,
      payload: options.payload,
    }, reqOpts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    throw new FanOutError(message, [err as Error], 400);
  }
}