import type { WorkspacesDb } from "../workspaces-db.js";
import { validateRequired } from "../utils.js";
import { sendResponse } from "../send-response.js";
import { readConfinedFile, writeConfinedFile, deleteConfinedFile } from "./file-confinement.js";
import { listAgentWorkspaceTree, workspaceRootTree } from "../agent-folder-tree.js";
import { mkdirSync } from "fs";
import { join } from "path";

export function handleCreateWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
  agentFolderBasePath?: string,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["name"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const name = payload.name as string;

  const path = payload.path as string | undefined;

  const workspace = wdb.createWorkspace({ name, path });

  // Create the workspace folder on disk if a base path is configured
  if (agentFolderBasePath) {
    const workspaceDir = join(agentFolderBasePath, ".workspaces", workspace.path);
    mkdirSync(workspaceDir, { recursive: true });
  }

  sendResponse(send, id, workspace);
}

export function handleListWorkspaces(
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const workspaces = wdb.listWorkspaces();
  sendResponse(send, id, workspaces);
}

export function handleGetWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  const workspace = wdb.getWorkspace(workspaceId);
  if (!workspace) {
    sendResponse(send, id, undefined, `workspace not found: ${workspaceId}`);
    return;
  }

  sendResponse(send, id, workspace);
}

export function handleUpdateWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  try {
    const workspace = wdb.updateWorkspace(workspaceId, {
      name: payload.name as string | undefined,
      path: payload.path as string | undefined,
    });
    sendResponse(send, id, workspace);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to update workspace";
    sendResponse(send, id, undefined, message);
  }
}

export function handleDeleteWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  try {
    wdb.deleteWorkspace(workspaceId);
    sendResponse(send, id, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to delete workspace";
    sendResponse(send, id, undefined, message);
  }
}

export function handleAddAgentToWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId", "agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;
  const agentId = payload.agentId as string;

  try {
    wdb.addAgentToWorkspace(workspaceId, agentId);
    sendResponse(send, id, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to add agent to workspace";
    sendResponse(send, id, undefined, message);
  }
}

export function handleRemoveAgentFromWorkspace(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId", "agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;
  const agentId = payload.agentId as string;

  wdb.removeAgentFromWorkspace(workspaceId, agentId);
  sendResponse(send, id, { success: true });
}

export function handleListWorkspaceAgents(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  const agentIds = wdb.listWorkspaceAgents(workspaceId);
  sendResponse(send, id, agentIds);
}

export function handleListAgentWorkspaces(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;

  const workspaceIds = wdb.listAgentWorkspaces(agentId);
  sendResponse(send, id, workspaceIds);
}

export function handleListWorkspaceFolder(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
  agentFolderBasePath?: string,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  const workspace = wdb.getWorkspace(workspaceId);
  if (!workspace) {
    sendResponse(send, id, undefined, `workspace not found: ${workspaceId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, { tree: workspaceRootTree(workspace.name, []) });
    return;
  }

  const workspaceDir = join(agentFolderBasePath, ".workspaces", workspace.path);
  const children = listAgentWorkspaceTree(workspaceDir);
  sendResponse(send, id, { tree: workspaceRootTree(workspace.name, children) });
}

export function handleReadWorkspaceFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
  agentFolderBasePath?: string,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId", "path"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;
  const filePath = payload.path as string;

  const workspace = wdb.getWorkspace(workspaceId);
  if (!workspace) {
    sendResponse(send, id, undefined, `workspace not found: ${workspaceId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const workspaceDir = join(agentFolderBasePath, ".workspaces", workspace.path);
  const result = readConfinedFile(workspaceDir, filePath);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}

export function handleWriteWorkspaceFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
  agentFolderBasePath?: string,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId", "path", "content"], new Set(["content"]));
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;
  const filePath = payload.path as string;
  const content = payload.content as string;

  const workspace = wdb.getWorkspace(workspaceId);
  if (!workspace) {
    sendResponse(send, id, undefined, `workspace not found: ${workspaceId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const workspaceDir = join(agentFolderBasePath, ".workspaces", workspace.path);
  const result = writeConfinedFile(workspaceDir, filePath, content);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}

export function handleDeleteWorkspaceFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wdb: WorkspacesDb | undefined,
  agentFolderBasePath?: string,
): void {
  if (!wdb) {
    sendResponse(send, id, undefined, "workspaces database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId", "path"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;
  const filePath = payload.path as string;

  const workspace = wdb.getWorkspace(workspaceId);
  if (!workspace) {
    sendResponse(send, id, undefined, `workspace not found: ${workspaceId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const workspaceDir = join(agentFolderBasePath, ".workspaces", workspace.path);
  const result = deleteConfinedFile(workspaceDir, filePath);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}
