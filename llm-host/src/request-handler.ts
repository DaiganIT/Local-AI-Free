import type { AgentsDb } from "./agents-db.js";
import type { ChatDb } from "./chat-db.js";
import type { WorkspacesDb } from "./workspaces-db.js";
import type { WorkspaceChatsDb } from "./workspace-chats-db.js";
import type { AgentRunInput, AgentRunResult } from "./agent-runner.js";
import type { RequestTracker } from "./request-tracker.js";
import { sendResponse } from "./send-response.js";
import { handleCreateAgent, handleListAgents, handleDeleteAgent, handleListAgentFolder, handleGetAgentInstructions, handleReadAgentFile, handleWriteAgentFile, handleDeleteAgentFile } from "./handlers/agent-handlers.js";
import { handleCreateChat, handleListChats, handleGetChat, handleDeleteChat } from "./handlers/chat-handlers.js";
import { handleSendMessage } from "./handlers/send-message.js";
import { handleCreateWorkspace, handleListWorkspaces, handleGetWorkspace, handleUpdateWorkspace, handleDeleteWorkspace, handleAddAgentToWorkspace, handleRemoveAgentFromWorkspace, handleListWorkspaceAgents, handleListAgentWorkspaces, handleListWorkspaceFolder, handleReadWorkspaceFile, handleWriteWorkspaceFile, handleDeleteWorkspaceFile } from "./handlers/workspace-handlers.js";
import { handleSendWorkspaceMessage, handleCreateWorkspaceChat, handleListWorkspaceChats, handleGetWorkspaceChat } from "./handlers/workspace-chat-handlers.js";
import { handleUploadAgentFile, handleUploadWorkspaceFile } from "./handlers/upload-handlers.js";


export interface RequestInput {
  action: string;
  payload: Record<string, unknown>;
  id: string;
  send: (data: unknown) => void;
  db: AgentsDb;
  chatDb?: ChatDb;
  wdb?: WorkspacesDb;
  wchatDb?: WorkspaceChatsDb;
  chatResponse: (input: AgentRunInput) => Promise<AgentRunResult>;
  contextLengthFor?: (model: string) => number | undefined;
  agentFolderBasePath?: string;
  tracker?: RequestTracker;
}

export async function handleRequest(input: RequestInput): Promise<void> {
  const { action, payload, id, send, db, chatDb, chatResponse } = input;

  switch (action) {
    case "create-agent":
      handleCreateAgent(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "list-agents":
      handleListAgents(id, send, db);
      break;

    case "send-message":
      await handleSendMessage(payload, id, send, db, chatDb, chatResponse, input.contextLengthFor, input.agentFolderBasePath, input.tracker);
      break;

    case "create-chat":
      handleCreateChat(payload, id, send, db, chatDb);
      break;

    case "list-chats":
      handleListChats(payload, id, send, chatDb);
      break;

    case "get-chat":
      handleGetChat(payload, id, send, chatDb, db, input.contextLengthFor);
      break;

    case "delete-chat":
      handleDeleteChat(payload, id, send, chatDb);
      break;

    case "delete-agent":
      handleDeleteAgent(payload, id, send, db, chatDb);
      break;

    case "get-agent-instructions":
      handleGetAgentInstructions(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "list-agent-folder":
      handleListAgentFolder(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "read-agent-file":
      handleReadAgentFile(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "write-agent-file":
      handleWriteAgentFile(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "delete-agent-file":
      handleDeleteAgentFile(payload, id, send, db, input.agentFolderBasePath);
      break;

    // ── Workspace actions ────────────────────────────────────────────────

    case "create-workspace":
      handleCreateWorkspace(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    case "list-workspaces":
      handleListWorkspaces(id, send, input.wdb);
      break;

    case "get-workspace":
      handleGetWorkspace(payload, id, send, input.wdb);
      break;

    case "update-workspace":
      handleUpdateWorkspace(payload, id, send, input.wdb);
      break;

    case "delete-workspace":
      handleDeleteWorkspace(payload, id, send, input.wdb);
      break;

    case "add-agent-to-workspace":
      handleAddAgentToWorkspace(payload, id, send, input.wdb);
      break;

    case "remove-agent-from-workspace":
      handleRemoveAgentFromWorkspace(payload, id, send, input.wdb);
      break;

    case "list-workspace-agents":
      handleListWorkspaceAgents(payload, id, send, input.wdb);
      break;

    case "list-agent-workspaces":
      handleListAgentWorkspaces(payload, id, send, input.wdb);
      break;

    case "send-workspace-message":
      await handleSendWorkspaceMessage(payload, id, send, input.db, input.wchatDb, input.chatResponse, input.contextLengthFor, input.agentFolderBasePath, input.wdb, input.tracker);
      break;

    case "create-workspace-chat":
      handleCreateWorkspaceChat(payload, id, send, input.wchatDb);
      break;

    case "list-workspace-chats":
      handleListWorkspaceChats(payload, id, send, input.wchatDb);
      break;

    case "get-workspace-chat":
      handleGetWorkspaceChat(payload, id, send, input.wchatDb);
      break;

    case "list-workspace-folder":
      handleListWorkspaceFolder(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    case "read-workspace-file":
      handleReadWorkspaceFile(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    case "write-workspace-file":
      handleWriteWorkspaceFile(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    case "delete-workspace-file":
      handleDeleteWorkspaceFile(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    // ── Upload actions ──────────────────────────────────────────────────

    case "upload-agent-file":
      handleUploadAgentFile(payload, id, send, db, input.agentFolderBasePath);
      break;

    case "upload-workspace-file":
      handleUploadWorkspaceFile(payload, id, send, input.wdb, input.agentFolderBasePath);
      break;

    default:
      sendResponse(send, id, undefined, `unknown action: ${action}`);
      break;
  }
}
