import { Router } from "express";
import multer from "multer";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import { createWorkspaceHandlers } from "../handlers/workspaces.js";
import { asyncHandler } from "../error-handler.js";

const upload = multer();

export function createWorkspacesRouter(registry: Registry, agentRouter: AgentRouter): Router {
  const router = Router();
  const handlers = createWorkspaceHandlers({ registry, agentRouter });

  // Workspace CRUD
  router.get("/api/workspaces", asyncHandler(handlers.handleListWorkspaces));
  router.post("/api/workspaces", asyncHandler(handlers.handleCreateWorkspace));
  router.get("/api/workspaces/:workspaceId", asyncHandler(handlers.handleGetWorkspace));
  router.put("/api/workspaces/:workspaceId", asyncHandler(handlers.handleUpdateWorkspace));
  router.delete("/api/workspaces/:workspaceId", asyncHandler(handlers.handleDeleteWorkspace));

  // Workspace agents
  router.post("/api/workspaces/:workspaceId/agents", asyncHandler(handlers.handleAddAgentToWorkspace));
  router.get("/api/workspaces/:workspaceId/agents", asyncHandler(handlers.handleListWorkspaceAgents));
  router.delete("/api/workspaces/:workspaceId/agents/:agentId", asyncHandler(handlers.handleRemoveAgentFromWorkspace));

  // Workspace chats
  router.post("/api/workspaces/:workspaceId/chats", asyncHandler(handlers.handleCreateWorkspaceChat));
  router.get("/api/workspaces/:workspaceId/chats", asyncHandler(handlers.handleListWorkspaceChats));
  router.get("/api/workspace-chats/:chatId", asyncHandler(handlers.handleGetWorkspaceChat));
  router.post("/api/workspace-chats/:chatId/messages", asyncHandler(handlers.handleSendWorkspaceMessage));
  router.post("/api/workspace-chats/:chatId/messages/stream", asyncHandler(handlers.handleSendWorkspaceMessageStream));

  // Workspace files
  router.get("/api/workspaces/:workspaceId/folder-tree", asyncHandler(handlers.handleGetWorkspaceFolderTree));
  router.get("/api/workspaces/:workspaceId/file", asyncHandler(handlers.handleGetWorkspaceFile));
  router.post("/api/workspaces/:workspaceId/uploads", upload.single("file"), asyncHandler(handlers.handleUploadWorkspaceFile));
  router.put("/api/workspaces/:workspaceId/file", asyncHandler(handlers.handleWriteWorkspaceFile));
  router.delete("/api/workspaces/:workspaceId/file", asyncHandler(handlers.handleDeleteWorkspaceFile));

  return router;
}