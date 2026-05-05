import { Router } from "express";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import { createChatHandlers } from "../handlers/chats.js";
import { asyncHandler } from "../error-handler.js";

export function createChatsRouter(registry: Registry, agentRouter: AgentRouter): Router {
  const router = Router();
  const handlers = createChatHandlers({ registry, agentRouter });

  router.post("/api/chat", asyncHandler(handlers.handleSendMessage));
  router.post("/api/chat/stream", asyncHandler(handlers.handleSendMessageStream));
  router.get("/api/chats/:chatId", asyncHandler(handlers.handleGetChat));
  router.delete("/api/chats/:chatId", asyncHandler(handlers.handleDeleteChat));

  return router;
}