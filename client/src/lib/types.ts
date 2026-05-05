export interface OllamaModel {
  name: string
  size: number
  contextLength?: number
  capabilities?: string[]
}

export interface HostInfo {
  id: string
  hostname: string
  connectedAt: string
  lastHeartbeat: string
  ollamaVersion: string
  models: OllamaModel[]
  status: 'online' | 'offline'
}

export interface AgentInfo {
  id: string
  hostId: string
  name: string
  alias?: string
  status: 'online' | 'idle' | 'offline'
  model: string
  description?: string

  tools?: string[]
  skills?: { name: string; description: string }[]
}

export type SidebarSelection =
  | null
  | { kind: 'agent'; id: string }
  | { kind: 'host-info'; hostId: string }
  | { kind: 'recent-activity' }

export interface ChatSelection {
  kind: 'chat'
  agentId: string
  chatId: string
}

export interface Chat {
  id: string
  agentId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatDetail {
  chat: Chat
  messages: Message[]
  contextUsed?: number
  contextLength?: number
}

export interface Attachment {
  name: string
  path: string
  size: number
  mimeType?: string
}

export interface Message {
  id: string
  agentId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  attachments?: Attachment[] | null
}

/** One node under an agent workspace (from relay GET /folder-tree). */
export interface AgentFolderNode {
  id: string
  name: string
  kind: 'file' | 'directory'
  children?: AgentFolderNode[]
}

export interface AgentFolderTreeResponse {
  tree: AgentFolderNode
}

/** A workspace returned from the relay API (includes hostId from fan-out). */
export interface WorkspaceInfo {
  id: string
  hostId: string
  name: string
  alias: string
  path: string
  createdAt: string
  updatedAt: string
}

/** An agent-to-workspace association. */
export interface WorkspaceAgent {
  workspaceId: string
  agentId: string
}

/** A workspace chat (from llm-host DB). */
export interface WorkspaceChat {
  id: string
  workspaceId: string
  title: string | null
  createdAt: string
  updatedAt: string
  promptCount: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
}

/** A message in a workspace chat. */
export interface WorkspaceMessage {
  id: string
  workspaceChatId: string
  senderType: 'user' | 'agent'
  senderId: string | null
  content: string
  timestamp: string
  modelUsed: string
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  attachments?: Attachment[] | null
}

/** A workspace chat with its messages. */
export interface WorkspaceChatDetail {
  chat: WorkspaceChat
  messages: WorkspaceMessage[]
}

/** Response from sending a workspace message (may include multiple agent responses). */
export interface SendWorkspaceMessageResponse {
  responses: Array<{ agentId: string; response: string }>
  workspaceChatId: string
  errors?: Array<{ agentId: string; message: string }>
}
