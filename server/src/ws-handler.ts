import type { Registry } from "./registry.js";
import type { AgentRouter } from "./agent-router.js";
import type { AuthConfig } from "./auth.js";
import { checkAuth } from "./auth.js";
import type { HostMessage, ServerMessage } from "./types.js";

/** Minimal shape of a WebSocket — lets us fake it in tests. */
export interface WsSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, listener: (...args: any[]) => void): void;
}

const OPEN = 1; // WebSocket.OPEN

export function createWsHandler(registry: Registry, auth?: AuthConfig, agentRouter?: AgentRouter) {
  return (socket: WsSocket) => {
    let hostId: string | null = null;
    let authenticated = !auth?.allowedKeys?.size; // no auth = auto-auth

    // Ping every 20 s to keep connection alive
    const pingInterval = setInterval(() => {
      if (socket.readyState === OPEN && authenticated) {
        const msg: ServerMessage = { type: "ping" };
        socket.send(JSON.stringify(msg));
      }
    }, 20_000);

    function cleanup() {
      clearInterval(pingInterval);
      if (hostId) {
        if (agentRouter) {
          agentRouter.unregisterHost(hostId);
        }
        registry.removeHost(hostId);
      }
    }

    function reject(message: string) {
      socket.send(JSON.stringify({ type: "error", message }));
      socket.close();
    }

    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        const rawStr = typeof raw === "string" ? raw : raw.toString();
        parsed = JSON.parse(rawStr);
      } catch {
        console.warn("[ws] Received non-JSON message, ignoring");
        return;
      }

      const msg = parsed as { type: string };

      if (msg.type === "register") {
        // Auth check
        const apiKey = (parsed as Record<string, unknown>).apiKey as string;
        const result = checkAuth(apiKey, auth);
        if (!result.ok) return reject(result.message);

        const reg = parsed as HostMessage;
        if (reg.type !== "register") return; // safety
        hostId = registry.registerHost(
          socket as never,
          reg.hostname,
          reg.ollamaVersion,
          reg.models,
        );

        // Register host with the agent-router so the server can
        // send agent requests to this llm-host over WS.
        if (agentRouter) {
          agentRouter.registerHost(hostId, socket);
        }

        const reply: ServerMessage = { type: "registered", id: hostId };
        socket.send(JSON.stringify(reply));
        authenticated = true;
      } else if (msg.type === "heartbeat" && hostId) {
        const hb = parsed as HostMessage;
        if (hb.type !== "heartbeat") return;
        registry.updateHeartbeat(hostId, hb.models);
      }
    });

    socket.on("close", cleanup);

    socket.on("error", (err) => {
      console.error("[ws] Socket error:", (err as Error).message);
      cleanup();
    });
  };
}
