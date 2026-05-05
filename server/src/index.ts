import "dotenv/config";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createRegistry } from "./registry.js";
import { createAgentRouter } from "./agent-router.js";
import { createApp } from "./routes.js";
import type { AuthConfig } from "./auth.js";
import { createWsHandler } from "./ws-handler.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ── Auth ─────────────────────────────────────────────────────────────────────
const rawKeys = process.env.SERVER_API_KEYS;
const auth: AuthConfig | undefined = rawKeys
  ? { allowedKeys: new Set(rawKeys.split(",").map((k) => k.trim()).filter(Boolean)) }
  : undefined;

// ── Registry (single instance for the app) ───────────────────────────────────
const registry = createRegistry({
  generateId: () => Math.random().toString(36).slice(2, 10),
  clock: () => new Date().toISOString(),
});

// ── Agent router (request/response over WS to llm-hosts) ─────────────────────
const agentRouter = createAgentRouter();

// ── HTTP server ──────────────────────────────────────────────────────────────
const app = createApp(registry, auth, agentRouter);
const httpServer = createServer(app);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: "/ws/host" });
const handleWs = createWsHandler(registry, auth, agentRouter);

wss.on("connection", (socket) => handleWs(socket));

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] WebSocket endpoint: ws://0.0.0.0:${PORT}/ws/host`);
  console.log(`[server] Hosts API:          http://0.0.0.0:${PORT}/hosts`);
  console.log(`[server] Agents API:         http://0.0.0.0:${PORT}/api/agents`);
});
