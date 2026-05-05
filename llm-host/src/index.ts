import { config } from "dotenv";
config();

import Database from "better-sqlite3";
import { WebSocket } from "ws";
import os from "os";
import { getOllamaVersion, getOllamaModels } from "./ollama.js";
import { buildRegisterMessage } from "./protocol.js";
import { createHeartbeat } from "./heartbeat.js";
import { handleMessage } from "./messageHandler.js";
import { createReconnector } from "./reconnector.js";
import { createDatabase } from "./agents-db.js";
import { createChatDatabase } from "./chat-db.js";
import { createWorkspacesDatabase } from "./workspaces-db.js";
import { createWorkspaceChatsDatabase } from "./workspace-chats-db.js";
import { createSupervisor } from "./agent-supervisor.js";
import { createStartup } from "./startup.js";
import { handleRequest } from "./request-handler.js";
import { runAgent } from "./agent-runner.js";
import { createRequestTracker } from "./request-tracker.js";

const SERVER_URL = process.env.SERVER_URL ?? "ws://localhost:3000/ws/host";
const API_KEY = process.env.API_KEY ?? "";
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

// ── Database & supervisor (created once, lives for the process lifetime) ─
const AGENTS_DB_PATH = process.env.AGENTS_DB ?? "agents.db";
const sqliteDb = new Database(AGENTS_DB_PATH);
const db = createDatabase(sqliteDb);
const chatDb = createChatDatabase(sqliteDb);
const wdb = createWorkspacesDatabase(sqliteDb);
const wchatDb = createWorkspaceChatsDatabase(sqliteDb);
const supervisor = createSupervisor(db);
const tracker = createRequestTracker();

// Cache models for contextLength lookup
let cachedModels: Awaited<ReturnType<typeof getOllamaModels>> = [];

function contextLengthFor(model: string): number | undefined {
  return cachedModels.find((m) => m.name === model)?.contextLength;
}

async function connect(): Promise<void> {
  const hostname = os.hostname();
  const { version: ollamaVersion, reachable } = await getOllamaVersion();
  const models = reachable ? await getOllamaModels() : [];
  cachedModels = models;

  console.log(`[host] Connecting to ${SERVER_URL} as "${hostname}"…`);
  if (reachable) {
    console.log(`[host] Ollama ${ollamaVersion} — ${models.length} model(s) loaded`);
  } else {
    console.warn(`[host] Ollama not reachable — the host will register with 0 models.`);
    console.warn(`[host] Start Ollama and restart this host, or it will retry on the next heartbeat.`);
  }

  const socket = new WebSocket(SERVER_URL);

  // ── Register once connected ──────────────────────────────────────────────
  socket.on("open", () => {
    console.log("[host] Connected — registering…");
    socket.send(buildRegisterMessage(hostname, ollamaVersion, models, API_KEY));
  });

  // ── Handle server messages ───────────────────────────────────────────────
  socket.on("message", (raw) => {
    handleMessage(raw.toString(), {
      onRegistered: (id) => {
        console.log(`[host] Registered with ID: ${id}`);
        createHeartbeat({
          intervalMs: HEARTBEAT_INTERVAL_MS,
          fetchModels: getOllamaModels,
          send: (data) => socket.send(data),
        });
      },
      onPing: () => {
        // Server keep-alive, nothing to do — ws handles pong at protocol level
      },
      onAbort: (requestId: string) => {
        console.log(`[host] Abort request received for: ${requestId}`);
        tracker.abort(requestId);
      },
      onRequest: (msg) => {
        console.log(`[host] Incoming request: ${msg.action} (id=${msg.id})`);
        handleRequest({
          action: msg.action,
          payload: msg.payload,
          id: msg.id,
          send: msg.send,
          db,
          chatDb,
          wdb,
          wchatDb,
          chatResponse: runAgent,
          contextLengthFor,
          agentFolderBasePath: process.env.AGENT_FOLDER_BASE_PATH,
          tracker,
        }).catch((err) => {
          console.error(`[host] Unhandled error in request handler (${msg.action}):`, err);
        });
      },
      sendResponse: (data) => {
        socket.send(typeof data === "string" ? data : JSON.stringify(data));
      },
    });
  });

  // ── Reconnect on close/error ─────────────────────────────────────────────
  const reconnect = createReconnector({
    delayMs: RECONNECT_DELAY_MS,
    onReconnect: () => connect(),
  });

  socket.on("close", () => {
    console.log(`[host] Connection closed — reconnecting in ${RECONNECT_DELAY_MS / 1000}s…`);
    reconnect.onConnectionLost();
  });

  socket.on("error", (err) => {
    console.error("[host] WebSocket error:", err.message);
    // close event will fire after this, triggering reconnect
  });
}

// ── Startup: load agents from DB, then connect ───────────────────────────
createStartup({
  supervisor,
  connect,
  onFatalError: (err: unknown) => {
    console.error("[host] Fatal error:", err);
    process.exit(1);
  },
});
