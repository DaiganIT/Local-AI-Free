import { Express } from "express";
import express from "express";
import cors from "cors";
import type { Registry } from "../registry.js";
import type { AuthConfig } from "../auth.js";
import { requireAuth } from "../auth.js";
import type { AgentRouter } from "../agent-router.js";
import { errorHandler } from "../error-handler.js";
import { createAgentsRouter } from "./agents.js";
import { createChatsRouter } from "./chats.js";
import { createWorkspacesRouter } from "./workspaces.js";
import { getHealth } from "./health.js";

export function createApp(registry: Registry, auth: AuthConfig | undefined, agentRouter: AgentRouter): Express {
  const app = express();
  app.use(express.json());

  // CORS — allow any origin during dev
  app.use(cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "X-API-Key"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  }));

  // Health check — always public (before auth middleware)
  app.get("/health", getHealth);

  // Auth middleware — applied to all routes below
  app.use(requireAuth(auth));

  // List connected LLM hosts
  app.get("/hosts", (_req, res) => {
    res.json(registry.listHosts());
  });

  // Mount domain routers
  app.use(createAgentsRouter(registry, agentRouter));
  app.use(createChatsRouter(registry, agentRouter));
  app.use(createWorkspacesRouter(registry, agentRouter));

  // Centralized error handler (must be after all routes)
  app.use(errorHandler);

  return app;
}