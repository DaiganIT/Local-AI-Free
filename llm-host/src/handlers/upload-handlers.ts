import type { AgentsDb } from "../agents-db.js";
import type { WorkspacesDb } from "../workspaces-db.js";
import { validateRequired } from "../utils.js";
import { writeConfinedFile } from "./file-confinement.js";
import { sendResponse } from "../send-response.js";
import { isAbsolute, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { Buffer } from "buffer";

export function handleUploadAgentFile(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  agentFolderBasePath?: string,
): void {
  const err = validateRequired(payload, ["agentId", "fileName", "content"], new Set(["content"]));
  if (err) { sendResponse(send, id, undefined, err); return; }

  const agentId = payload.agentId as string;
  const fileName = payload.fileName as string;
  const content = payload.content as string;
  const mimeType = payload.mimeType as string | undefined;

  // Validate fileName — must be relative and no traversal
  if (isAbsolute(fileName) || fileName.includes("..")) {
    sendResponse(send, id, undefined, "path not allowed");
    return;
  }

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
  const uploadsDir = join(agentDir, "uploads");

  // Ensure uploads/ directory exists
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  // If mimeType is present, content is base64 — decode to Buffer for binary write
  const writeContent: string | Buffer = mimeType
    ? Buffer.from(content, "base64")
    : content;
  const size = typeof writeContent === "string"
    ? Buffer.byteLength(writeContent, "utf-8")
    : writeContent.length;

  // Write to uploads/<fileName> — writeConfinedFile handles path security
  const filePath = `uploads/${fileName}`;
  const result = writeConfinedFile(agentDir, filePath, writeContent);

  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    const response: Record<string, unknown> = {
      path: filePath,
      name: fileName,
      size,
    };
    if (mimeType) response.mimeType = mimeType;
    sendResponse(send, id, response);
  }
}

export function handleUploadWorkspaceFile(
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

  const err = validateRequired(payload, ["workspaceId", "fileName", "content"], new Set(["content"]));
  if (err) { sendResponse(send, id, undefined, err); return; }

  const workspaceId = payload.workspaceId as string;
  const fileName = payload.fileName as string;
  const content = payload.content as string;
  const mimeType = payload.mimeType as string | undefined;

  // Validate fileName — must be relative and no traversal
  if (isAbsolute(fileName) || fileName.includes("..")) {
    sendResponse(send, id, undefined, "path not allowed");
    return;
  }

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
  const uploadsDir = join(workspaceDir, "uploads");

  // Ensure uploads/ directory exists
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  // If mimeType is present, content is base64 — decode to Buffer for binary write
  const writeContent: string | Buffer = mimeType
    ? Buffer.from(content, "base64")
    : content;
  const size = typeof writeContent === "string"
    ? Buffer.byteLength(writeContent, "utf-8")
    : writeContent.length;

  // Write to uploads/<fileName> — writeConfinedFile handles path security
  const filePath = `uploads/${fileName}`;
  const result = writeConfinedFile(workspaceDir, filePath, writeContent);

  if ("error" in result) {
    sendResponse(send, id, undefined, result.error);
  } else {
    const response: Record<string, unknown> = {
      path: filePath,
      name: fileName,
      size,
    };
    if (mimeType) response.mimeType = mimeType;
    sendResponse(send, id, response);
  }
}
