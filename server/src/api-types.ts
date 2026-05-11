// ── Shared API request/response types ────────────────────────────────────────
// These types mirror the shapes used in routes.ts handlers.
// Fields are optional where the route performs validation.

// ── Agent ────────────────────────────────────────────────────────────────────

export interface CreateAgentRequest {
  hostId?: string;
  name?: string;
  model?: string;
  tools?: string[];
  skills?: { name: string; description: string }[];
  instructions?: string;
}

export interface SendMessageRequest {
  agentId?: string;
  prompt?: string;
  chatId?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  path: string;
  size: number;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface CreateChatRequest {
  title?: string;
}

// ── Workspace ────────────────────────────────────────────────────────────────

export interface CreateWorkspaceRequest {
  hostId?: string;
  name?: string;
  path?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  path?: string;
}

export interface AddAgentToWorkspaceRequest {
  agentId?: string;
  hostId?: string;
}

export interface RemoveAgentFromWorkspaceRequest {
  hostId?: string;
}

// ── Workspace Chat ──────────────────────────────────────────────────────────

export interface CreateWorkspaceChatRequest {
  hostId?: string;
  title?: string;
}

export interface SendWorkspaceMessageRequest {
  prompt?: string;
  agentIds?: string[];
  attachments?: Attachment[];
}

// ── File ─────────────────────────────────────────────────────────────────────

export interface WriteAgentFileRequest {
  path?: string;
  content?: string;
}

export interface WriteWorkspaceFileRequest {
  hostId?: string;
  path?: string;
  content?: string;
}

export interface UploadAgentFileJsonRequest {
  fileName?: string;
  content?: string;
  mimeType?: string;
}

export interface UploadWorkspaceFileJsonRequest {
  hostId?: string;
  fileName?: string;
  content?: string;
}

// ── Error response ───────────────────────────────────────────────────────────

export interface ErrorResponse {
  error: string;
}

export function errorResponse(error: string): ErrorResponse {
  return { error };
}