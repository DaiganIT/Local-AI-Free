import type { Request, Response } from "express";
import type { Registry } from "../registry.js";
import type { AgentRouter } from "../agent-router.js";
import {
  fanOutToAllHosts,
  fanOutToFirstHost,
  fanOutToSpecificHost,
  FanOutError,
} from "../fanout.js";
import { requireParam, requireQuery, requireField } from "../validate.js";
import { BadRequestError, NotFoundError } from "../error-handler.js";
import { NoHostsError } from "../fanout.js";
import { streamToSse } from "../sse.js";
import { errorResponse } from "../api-types.js";
import type {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  AddAgentToWorkspaceRequest,
  RemoveAgentFromWorkspaceRequest,
  CreateWorkspaceChatRequest,
  SendWorkspaceMessageRequest,
  WriteWorkspaceFileRequest,
  UploadWorkspaceFileJsonRequest,
} from "../api-types.js";

export interface WorkspaceDeps {
  registry: Registry;
  agentRouter: AgentRouter;
}

export function createWorkspaceHandlers(deps: WorkspaceDeps) {
  const { registry, agentRouter } = deps;

  // ── Workspace CRUD ───────────────────────────────────────────────────────

  // GET /api/workspaces — list all workspaces across all hosts
  async function handleListWorkspaces(_req: Request, res: Response): Promise<void> {
    const workspaces = await fanOutToAllHosts(registry, agentRouter, {
      action: "list-workspaces",
      payload: {},
      timeoutMs: 5_000,
    });
    res.json(workspaces);
  }

  // POST /api/workspaces — create a workspace on a specific host
  async function handleCreateWorkspace(req: Request, res: Response): Promise<void> {
    const { hostId, name, path } = req.body as CreateWorkspaceRequest;
    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "create-workspace",
      payload: { name, path },
      timeoutMs: 10_000,
    });
    res.status(201).json(data);
  }

  // GET /api/workspaces/:workspaceId — get a workspace (fan-out)
  async function handleGetWorkspace(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "get-workspace",
        payload: { workspaceId },
        timeoutMs: 5_000,
      });
      res.json(result.data);
    } catch (err) {
      if (err instanceof FanOutError) {
        throw new NotFoundError("workspace not found");
      }
      throw err;
    }
  }

  // PUT /api/workspaces/:workspaceId — update a workspace (fan-out)
  async function handleUpdateWorkspace(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const { name, path } = req.body as UpdateWorkspaceRequest;

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "update-workspace",
        payload: { workspaceId, name, path },
        timeoutMs: 5_000,
      });
      res.json(result.data);
    } catch (err) {
      if (err instanceof FanOutError) {
        // Re-throw fan-out errors as 400 (bad request from agent)
        throw new BadRequestError(err.message);
      }
      throw err;
    }
  }

  // DELETE /api/workspaces/:workspaceId — delete a workspace (fan-out)
  async function handleDeleteWorkspace(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");

    const result = await fanOutToFirstHost(registry, agentRouter, {
      action: "delete-workspace",
      payload: { workspaceId },
      timeoutMs: 5_000,
    });
    res.json(result.data);
  }

  // ── Workspace Agents ─────────────────────────────────────────────────────

  // POST /api/workspaces/:workspaceId/agents — add agent to workspace
  async function handleAddAgentToWorkspace(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const { agentId, hostId } = req.body as AddAgentToWorkspaceRequest;
    if (!agentId) throw new BadRequestError("missing required field: agentId");
    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "add-agent-to-workspace",
      payload: { workspaceId, agentId },
      timeoutMs: 5_000,
    });
    res.json(data);
  }

  // GET /api/workspaces/:workspaceId/agents — list agents in workspace
  async function handleListWorkspaceAgents(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const hostId = requireQuery(req.query.hostId as string | undefined, "hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "list-workspace-agents",
      payload: { workspaceId },
      timeoutMs: 5_000,
    });
    res.json(data);
  }

  // DELETE /api/workspaces/:workspaceId/agents/:agentId — remove agent from workspace
  async function handleRemoveAgentFromWorkspace(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const agentId = requireParam(req.params.agentId, "agentId");
    const { hostId } = req.body as RemoveAgentFromWorkspaceRequest;
    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "remove-agent-from-workspace",
      payload: { workspaceId, agentId },
      timeoutMs: 5_000,
    });
    res.json(data);
  }

  // ── Workspace Chat ────────────────────────────────────────────────────────

  // POST /api/workspaces/:workspaceId/chats — create a workspace chat
  async function handleCreateWorkspaceChat(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const { hostId, title } = req.body as CreateWorkspaceChatRequest;
    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "create-workspace-chat",
      payload: { workspaceId, title },
      timeoutMs: 5_000,
    });
    res.status(201).json(data);
  }

  // GET /api/workspaces/:workspaceId/chats — list workspace chats
  async function handleListWorkspaceChats(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const hostId = requireQuery(req.query.hostId as string | undefined, "hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "list-workspace-chats",
      payload: { workspaceId },
      timeoutMs: 5_000,
    });
    res.json(data);
  }

  // GET /api/workspace-chats/:chatId — get a workspace chat with messages
  async function handleGetWorkspaceChat(req: Request, res: Response): Promise<void> {
    const chatId = requireParam(req.params.chatId, "chatId");

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "get-workspace-chat",
        payload: { workspaceChatId: chatId },
        timeoutMs: 5_000,
      });
      res.json(result.data);
    } catch (err) {
      if (err instanceof FanOutError) {
        throw new NotFoundError("workspace chat not found");
      }
      throw err;
    }
  }

  // POST /api/workspace-chats/:chatId/messages — send a message to mentioned agents
  async function handleSendWorkspaceMessage(req: Request, res: Response): Promise<void> {
    const chatId = req.params.chatId;
    if (!chatId) throw new BadRequestError("missing required param: chatId");

    const { prompt, agentIds } = req.body as SendWorkspaceMessageRequest;
    if (!prompt) throw new BadRequestError("missing required field: prompt");
    if (!agentIds) throw new BadRequestError("missing required field: agentIds");
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      throw new BadRequestError("agentIds must be a non-empty array");
    }

    try {
      const result = await fanOutToFirstHost(registry, agentRouter, {
        action: "send-workspace-message",
        payload: { workspaceChatId: chatId, prompt, agentIds, attachments: req.body.attachments },
        timeoutMs: 120_000,
      });
      res.json(result.data);
    } catch (err) {
      if (err instanceof FanOutError) {
        const allNotFound = err.errors.every((e) =>
          e.message.includes("not found")
        );
        if (allNotFound) {
          throw new BadRequestError(err.errors[0].message);
        }
      }
      throw err;
    }
  }

  // POST /api/workspace-chats/:chatId/messages/stream — SSE streaming for workspace chats
  async function handleSendWorkspaceMessageStream(req: Request, res: Response): Promise<void> {
    const chatId = req.params.chatId;
    if (!chatId) throw new BadRequestError("missing required param: chatId");

    const { prompt, agentIds } = req.body as SendWorkspaceMessageRequest;
    if (!prompt) throw new BadRequestError("missing required field: prompt");
    if (!agentIds) throw new BadRequestError("missing required field: agentIds");
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      throw new BadRequestError("agentIds must be a non-empty array");
    }

    const hosts = registry.listHosts();
    if (hosts.length === 0) throw new NoHostsError();

    await streamToSse(res, hosts, agentRouter, {
      action: "send-workspace-message",
      payload: { workspaceChatId: chatId, prompt, agentIds, attachments: req.body.attachments },
      preserveAgentId: true,
    });
  }

  // ── Workspace Files ───────────────────────────────────────────────────────

  // GET /api/workspaces/:workspaceId/folder-tree — list workspace folder tree
  async function handleGetWorkspaceFolderTree(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const hostId = requireQuery(req.query.hostId as string | undefined, "hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "list-workspace-folder",
      payload: { workspaceId },
      timeoutMs: 10_000,
    });
    res.json(data);
  }

  // GET /api/workspaces/:workspaceId/file — read a workspace file
  async function handleGetWorkspaceFile(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const hostId = requireQuery(req.query.hostId as string | undefined, "hostId");
    const path = requireQuery(req.query.path as string | undefined, "path");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "read-workspace-file",
      payload: { workspaceId, path },
      timeoutMs: 10_000,
    });
    res.json(data);
  }

  // POST /api/workspaces/:workspaceId/uploads — upload a file to workspace
  async function handleUploadWorkspaceFile(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");

    let hostId: string;
    let fileName: string;
    let content: string;
    let mimeType: string | undefined;

    if (req.file) {
      hostId = (req.body as { hostId?: string }).hostId ?? "";
      fileName = req.file.originalname;
      content = req.file.buffer.toString("base64");
      mimeType = req.file.mimetype;
    } else {
      const body = req.body as UploadWorkspaceFileJsonRequest;
      hostId = body.hostId ?? "";
      if (!body.fileName) throw new BadRequestError("missing required field: fileName");
      if (body.content === undefined || body.content === null) throw new BadRequestError("missing required field: content");
      fileName = body.fileName;
      content = body.content;
    }

    if (!hostId) throw new BadRequestError("missing required field: hostId");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "upload-workspace-file",
      payload: { workspaceId, fileName, content, mimeType },
      timeoutMs: 10_000,
    });
    res.json(data);
  }

  // PUT /api/workspaces/:workspaceId/file — write a workspace file
  async function handleWriteWorkspaceFile(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const { hostId, path, content } = req.body as WriteWorkspaceFileRequest;
    if (!hostId) throw new BadRequestError("missing required field: hostId");
    if (!path) throw new BadRequestError("missing required field: path");
    if (content === undefined || content === null) throw new BadRequestError("missing required field: content");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "write-workspace-file",
      payload: { workspaceId, path, content },
      timeoutMs: 10_000,
    });
    res.json(data);
  }

  // DELETE /api/workspaces/:workspaceId/file — delete a workspace file
  async function handleDeleteWorkspaceFile(req: Request, res: Response): Promise<void> {
    const workspaceId = requireParam(req.params.workspaceId, "workspaceId");
    const hostId = req.query.hostId as string | undefined;
    const path = req.query.path as string | undefined;
    if (!hostId) throw new BadRequestError("missing required query param: hostId");
    if (!path) throw new BadRequestError("missing required query param: path");

    const data = await fanOutToSpecificHost(registry, agentRouter, hostId, {
      action: "delete-workspace-file",
      payload: { workspaceId, path },
      timeoutMs: 10_000,
    });
    res.json(data);
  }

  return {
    handleListWorkspaces,
    handleCreateWorkspace,
    handleGetWorkspace,
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    handleAddAgentToWorkspace,
    handleListWorkspaceAgents,
    handleRemoveAgentFromWorkspace,
    handleCreateWorkspaceChat,
    handleListWorkspaceChats,
    handleGetWorkspaceChat,
    handleSendWorkspaceMessage,
    handleSendWorkspaceMessageStream,
    handleGetWorkspaceFolderTree,
    handleGetWorkspaceFile,
    handleUploadWorkspaceFile,
    handleWriteWorkspaceFile,
    handleDeleteWorkspaceFile,
  };
}