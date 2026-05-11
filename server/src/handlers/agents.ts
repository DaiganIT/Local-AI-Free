import type { Request, Response } from "express";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import {
  fanOutToAllHosts,
  fanOutToFirstHost,
  fanOutToSpecificHost,
  FanOutError,
  NoHostsError,
} from "../fanout.js";
import { requireParam, requireQuery, requireField } from "../validate.js";
import { BadRequestError } from "../error-handler.js";
import type {
  CreateAgentRequest,
  CreateChatRequest,
  WriteAgentFileRequest,
  UploadAgentFileJsonRequest,
} from "../api-types.js";

export interface AgentDeps {
  registry: Registry;
  agentRouter: AgentRouter;
}

export function createAgentHandlers(deps: AgentDeps) {
  const { registry, agentRouter } = deps;

  // GET /api/agents — list all agents across all hosts
  async function handleListAgents(_req: Request, res: Response): Promise<void> {
    const agents = await fanOutToAllHosts(registry, agentRouter, {
      action: "list-agents",
      payload: {},
      timeoutMs: 5_000,
    });
    res.json(agents);
  }

  // POST /api/agents — create an agent on a specific host
  async function handleCreateAgent(req: Request, res: Response): Promise<void> {
    const { hostId, name, model, tools, skills, instructions } = req.body as CreateAgentRequest;
    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "create-agent",
      payload: { name, model, tools, skills, instructions },
      timeoutMs: 10_000,
    });
    res.status(201).json(data);
  }

  // DELETE /api/agents/:agentId — delete an agent (fan-out to hosts)
  async function handleDeleteAgent(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "delete-agent",
      payload: { agentId },
      timeoutMs: 5_000,
    });
    res.json(result.data);
  }

  // GET /api/agents/:agentId/instructions — get agent's AGENTS.md content
  async function handleGetAgentInstructions(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "get-agent-instructions",
      payload: { agentId },
      timeoutMs: 5_000,
    });
    res.json(result.data);
  }

  // GET /api/agents/:agentId/folder-tree — workspace listing
  async function handleGetAgentFolderTree(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "list-agent-folder",
      payload: { agentId },
      timeoutMs: 10_000,
    });
    res.json(result.data);
  }

  // GET /api/agents/:agentId/file — read a workspace file
  async function handleGetAgentFile(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");
    const path = requireQuery(req.query.path as string | undefined, "path");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "read-agent-file",
      payload: { agentId, path },
      timeoutMs: 10_000,
    });
    res.json(result.data);
  }

  // PUT /api/agents/:agentId/file — write a workspace file
  async function handleWriteAgentFile(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");
    const { path, content } = req.body as WriteAgentFileRequest;
    if (!path) throw new BadRequestError("missing required field: path");
    if (content === undefined || content === null) throw new BadRequestError("missing required field: content");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "write-agent-file",
      payload: { agentId, path, content },
      timeoutMs: 10_000,
    });
    res.json(result.data);
  }

  // DELETE /api/agents/:agentId/file — delete a workspace file
  async function handleDeleteAgentFile(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");
    const path = requireQuery(req.query.path as string | undefined, "path");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "delete-agent-file",
      payload: { agentId, path },
      timeoutMs: 10_000,
    });
    res.json(result.data);
  }

  // POST /api/agents/:agentId/uploads — upload a file (multipart or JSON)
  async function handleUploadAgentFile(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");

    let fileName: string;
    let content: string;
    let mimeType: string | undefined;

    if (req.file) {
      fileName = req.file.originalname;
      content = req.file.buffer.toString("base64");
      mimeType = req.file.mimetype;
    } else if (req.is("multipart/form-data")) {
      throw new BadRequestError("missing required field: file");
    } else {
      const body = req.body as UploadAgentFileJsonRequest;
      if (!body.fileName) throw new BadRequestError("missing required field: fileName");
      if (body.content === undefined || body.content === null) throw new BadRequestError("missing required field: content");
      fileName = body.fileName;
      content = body.content;
      mimeType = body.mimeType;
    }

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "upload-agent-file",
      payload: { agentId, fileName, content, mimeType },
      timeoutMs: 10_000,
    });
    res.json(result.data);
  }

  // GET /api/agents/:agentId/chats — list chats for an agent
  async function handleListAgentChats(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "list-chats",
        payload: { agentId },
        timeoutMs: 5_000,
      });
      res.json(result.data);
    } catch (err) {
      // Agent not found on any host → return empty chats
      if (err instanceof NoHostsError || err instanceof FanOutError) {
        res.json([]);
        return;
      }
      throw err;
    }
  }

  // POST /api/agents/:agentId/chats — create a new chat
  async function handleCreateAgentChat(req: Request, res: Response): Promise<void> {
    const agentId = requireParam(req.params.agentId, "agentId");
    const { title } = req.body as CreateChatRequest;

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "create-chat",
      payload: { agentId, title },
      timeoutMs: 5_000,
    });
    res.status(201).json(result.data);
  }

  return {
    handleListAgents,
    handleCreateAgent,
    handleDeleteAgent,
    handleGetAgentInstructions,
    handleGetAgentFolderTree,
    handleGetAgentFile,
    handleWriteAgentFile,
    handleDeleteAgentFile,
    handleUploadAgentFile,
    handleListAgentChats,
    handleCreateAgentChat,
  };
}