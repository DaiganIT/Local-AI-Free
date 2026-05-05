import type { AgentsDb } from "../agents-db.js";
import type { ChatDb } from "../chat-db.js";
import { validateRequired } from "../utils.js";
import { listAgentWorkspaceTree, workspaceRootTree } from "../agent-folder-tree.js";
import { readConfinedFile, writeConfinedFile, deleteConfinedFile } from "./file-confinement.js";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { sendResponse } from "../send-response.js";

export function handleCreateAgent(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["name", "model"]);
  if (err) { sendResponse(send, id, undefined, err); return; }

  const name = payload.name as string;
  const model = payload.model as string;

  const agent = db.createAgent({
    name,
    model,
    tools: payload.tools as string[] | undefined,
    skills: payload.skills as { name: string; description: string }[] | undefined,
  });

  // Create the agent's folder on disk if a base path is configured
  if (agentFolderBasePath) {
    const agentDir = join(agentFolderBasePath, ".agents", agent.alias);
    mkdirSync(agentDir, { recursive: true });

    // Write AGENTS.md with instructions (default, "You are a helpful assistant.")
    const instructions = (payload.instructions as string | undefined)?.trim() || "You are a helpful assistant.";
    writeFileSync(join(agentDir, "AGENTS.md"), instructions, "utf-8");
  }

  sendResponse(send, id, agent);
}

export function handleListAgents(
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
): void {
  const agents = db.listAgents();
  sendResponse(send, id, agents);
}

export function handleDeleteAgent(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  chatDb: ChatDb | undefined,
): void {
  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;

  // Verify agent exists before we delete
  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  // Cascade-delete all chats belonging to this agent
  if (chatDb) {
    const chats = chatDb.listChats(agentId);
    for (const chat of chats) {
      chatDb.deleteChat(chat.id);
    }
  }

  try {
    db.deleteAgent(agentId);
    sendResponse(send, id, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to delete agent";
    sendResponse(send, id, undefined, message);
  }
}

export function handleListAgentFolder(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;

  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, { tree: workspaceRootTree(agent.alias, []) });
    return;
  }

  const agentDir = join(agentFolderBasePath, ".agents", agent.alias);
  const children = listAgentWorkspaceTree(agentDir);
  sendResponse(send, id, { tree: workspaceRootTree(agent.alias, children) });
}

export function handleGetAgentInstructions(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;

  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, { instructions: "You are a helpful assistant." });
    return;
  }

  const agentsMdPath = join(agentFolderBasePath, ".agents", agent.alias, "AGENTS.md");
  try {
    const content = readFileSync(agentsMdPath, "utf-8");
    sendResponse(send, id, { instructions: content });
  } catch {
    sendResponse(send, id, { instructions: "You are a helpful assistant." });
  }
}

export function handleReadAgentFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId", "path"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;
  const filePath = payload.path as string;

  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const agentDir = join(agentFolderBasePath, ".agents", agent.alias);
  const result = readConfinedFile(agentDir, filePath);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}

export function handleWriteAgentFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId", "path", "content"], new Set(["content"]));
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;
  const filePath = payload.path as string;
  const content = payload.content as string;

  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const agentDir = join(agentFolderBasePath, ".agents", agent.alias);
  const result = writeConfinedFile(agentDir, filePath, content);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}

export function handleDeleteAgentFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId", "path"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;
  const filePath = payload.path as string;

  const agent = db.getAgent(agentId);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  if (!agentFolderBasePath) {
    sendResponse(send, id, undefined, "workspace not configured");
    return;
  }

  const agentDir = join(agentFolderBasePath, ".agents", agent.alias);
  const result = deleteConfinedFile(agentDir, filePath);
  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    sendResponse(send, id, result);
  }
}
