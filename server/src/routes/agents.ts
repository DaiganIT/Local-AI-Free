import { Router } from "express";
import multer from "multer";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import { createAgentHandlers } from "../handlers/agents.js";
import { asyncHandler } from "../error-handler.js";

const upload = multer();

export function createAgentsRouter(registry: Registry, agentRouter: AgentRouter): Router {
  const router = Router();
  const handlers = createAgentHandlers({ registry, agentRouter });

  router.get("/api/agents", asyncHandler(handlers.handleListAgents));
  router.post("/api/agents", asyncHandler(handlers.handleCreateAgent));
  router.delete("/api/agents/:agentId", asyncHandler(handlers.handleDeleteAgent));
  router.get("/api/agents/:agentId/instructions", asyncHandler(handlers.handleGetAgentInstructions));
  router.get("/api/agents/:agentId/folder-tree", asyncHandler(handlers.handleGetAgentFolderTree));
  router.get("/api/agents/:agentId/file", asyncHandler(handlers.handleGetAgentFile));
  router.put("/api/agents/:agentId/file", asyncHandler(handlers.handleWriteAgentFile));
  router.delete("/api/agents/:agentId/file", asyncHandler(handlers.handleDeleteAgentFile));
  router.post("/api/agents/:agentId/uploads", upload.single("file"), asyncHandler(handlers.handleUploadAgentFile));
  router.get("/api/agents/:agentId/chats", asyncHandler(handlers.handleListAgentChats));
  router.post("/api/agents/:agentId/chats", asyncHandler(handlers.handleCreateAgentChat));

  return router;
}