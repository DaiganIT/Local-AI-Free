import type { Request, Response } from "express";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import { fanOutToFirstHost, FanOutError } from "../fanout.js";
import { requireParam } from "../validate.js";
import { BadRequestError, NotFoundError } from "../error-handler.js";
import { NoHostsError } from "../fanout.js";
import { streamToSse } from "../sse.js";
import type { SendMessageRequest } from "../api-types.js";

export interface ChatDeps {
  registry: Registry;
  agentRouter: AgentRouter;
}

export function createChatHandlers(deps: ChatDeps) {
  const { registry, agentRouter } = deps;

  // POST /api/chat — send a message to an agent (non-streaming)
  async function handleSendMessage(req: Request, res: Response): Promise<void> {
    const body = req.body as SendMessageRequest;
    const { agentId, prompt } = body;
    const chatId = body.chatId;
    const attachments = body.attachments;

    if (!agentId) throw new BadRequestError("missing required field: agentId");
    if (!prompt) throw new BadRequestError("missing required field: prompt");

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "send-message",
        payload: { agentId, prompt, chatId, attachments },
        timeoutMs: 60_000,
      });

      // Host may return a string (legacy) or an object with response/agentId/chatId
      const data = result.data;
      if (typeof data === "string") {
        res.json({ response: data });
        return;
      }
      res.json(data);
    } catch (err) {
      if (err instanceof FanOutError) {
        // Check if all errors were "agent not found" → throw as 400
        const allNotFound = err.errors.every((e) =>
          e.message.includes("agent not found")
        );
        if (allNotFound) {
          throw new BadRequestError(err.errors[0].message);
        }
      }
      throw err; // Let error middleware handle FanOutError/NoHostsError
    }
  }

  // POST /api/chat/stream — send a message with SSE streaming
  async function handleSendMessageStream(req: Request, res: Response): Promise<void> {
    const body = req.body as SendMessageRequest;
    const { agentId, prompt } = body;
    const chatId = body.chatId;
    const attachments = body.attachments;

    if (!agentId) throw new BadRequestError("missing required field: agentId");
    if (!prompt) throw new BadRequestError("missing required field: prompt");

    const hosts = registry.listHosts();
    if (hosts.length === 0) throw new NoHostsError();

    await streamToSse(res, hosts, agentRouter, {
      action: "send-message",
      payload: { agentId, prompt, chatId, attachments },
    });
  }

  // GET /api/chats/:chatId — get a chat with its messages
  async function handleGetChat(req: Request, res: Response): Promise<void> {
    const chatId = requireParam(req.params.chatId, "chatId");

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "get-chat",
        payload: { chatId },
        timeoutMs: 5_000,
      });
      res.json(result.data);
    } catch (err) {
      if (err instanceof FanOutError) {
        // Check if all errors were "not found" → throw as 404
        const allNotFound = err.errors.every((e) =>
          e.message.includes("not found")
        );
        if (allNotFound) {
          throw new NotFoundError("chat not found");
        }
      }
      throw err;
    }
  }

  // DELETE /api/chats/:chatId — delete a chat
  async function handleDeleteChat(req: Request, res: Response): Promise<void> {
    const chatId = requireParam(req.params.chatId, "chatId");

    await fanOutToFirstHost(registry, agentRouter, {
      action: "delete-chat",
      payload: { chatId },
      timeoutMs: 5_000,
    });
    res.json({ success: true });
  }

  return {
    handleSendMessage,
    handleSendMessageStream,
    handleGetChat,
    handleDeleteChat,
  };
}