/**
 * Shared navigation helpers for URL-based routing.
 *
 * Route structure:
 *   /                              → Welcome
 *   /activity                      → Recent Activity
 *   /hosts/:hostId                 → Host info
 *   /hosts/:hostId/a/:agentId      → Agent chat
 *   /hosts/:hostId/a/:agentId/c/:chatId → Chat view
 *
 * Search params on agent routes:
 *   ?file=<encoded workspace-relative path>   → open artifact viewer
 */

export type NavKind = 'welcome' | 'recent-activity' | 'host-info' | 'agent' | 'chat' | 'create-agent' | 'create-workspace' | 'workspace' | 'workspace-chat'

export interface NavState {
  kind: NavKind
  hostId?: string
  agentId?: string
  chatId?: string
  workspaceId?: string
  workspaceChatId?: string
  file?: string
}

export const nav = {
  home: () => '/',
  host: (hostId: string) => `/hosts/${hostId}`,
  agent: (hostId: string, agentId: string, search?: AgentSearch) => {
    const base = `/hosts/${hostId}/a/${agentId}`
    if (!search) return base
    const qs = agentSearchString(search)
    return qs ? `${base}?${qs}` : base
  },
  chat: (hostId: string, agentId: string, chatId: string, search?: AgentSearch) => {
    const base = `/hosts/${hostId}/a/${agentId}/c/${chatId}`
    if (!search) return base
    const qs = agentSearchString(search)
    return qs ? `${base}?${qs}` : base
  },
  workspace: (hostId: string, workspaceId: string) => `/hosts/${hostId}/w/${workspaceId}`,
  workspaceChat: (hostId: string, workspaceId: string, chatId: string) => `/hosts/${hostId}/w/${workspaceId}/c/${chatId}`,
  activity: () => '/activity',
  createAgent: () => '/create-agent',
  createWorkspace: () => '/create-workspace',
} as const

/** Search params for agent routes (`/hosts/:hostId/a/:agentId`). */
export interface AgentSearch {
  /** Workspace-relative path of the file to open in the artifact panel. */
  file?: string
}

/** Serialize AgentSearch to a URL query string (without the leading `?`). */
export function agentSearchString(search: AgentSearch): string {
  const params = new URLSearchParams()
  if (search.file) params.set('file', search.file)
  const str = params.toString()
  return str
}

export function parsePath(path: string): NavState {
  // Split pathname from search
  const [pathname, searchStr] = path.split('?', 2)
  const search = new URLSearchParams(searchStr ?? '')
  const file = search.get('file') ?? undefined

  // /hosts/:hostId/a/:agentId/c/:chatId
  const chatMatch = pathname.match(/^\/hosts\/([^/]+)\/a\/([^/]+)\/c\/([^/]+)$/)
  if (chatMatch) {
    return { kind: 'chat', hostId: chatMatch[1], agentId: chatMatch[2], chatId: chatMatch[3], file }
  }

  // /hosts/:hostId/w/:workspaceId/c/:chatId
  const workspaceChatMatch = pathname.match(/^\/hosts\/([^/]+)\/w\/([^/]+)\/c\/([^/]+)$/)
  if (workspaceChatMatch) {
    return { kind: 'workspace-chat', hostId: workspaceChatMatch[1], workspaceId: workspaceChatMatch[2], workspaceChatId: workspaceChatMatch[3] }
  }

  // /hosts/:hostId/w/:workspaceId
  const workspaceMatch = pathname.match(/^\/hosts\/([^/]+)\/w\/([^/]+)$/)
  if (workspaceMatch) {
    return { kind: 'workspace', hostId: workspaceMatch[1], workspaceId: workspaceMatch[2] }
  }

  // /hosts/:hostId/a/:agentId
  const agentMatch = pathname.match(/^\/hosts\/([^/]+)\/a\/([^/]+)$/)
  if (agentMatch) {
    return { kind: 'agent', hostId: agentMatch[1], agentId: agentMatch[2], file }
  }

  // /hosts/:hostId
  const hostMatch = pathname.match(/^\/hosts\/([^/]+)$/)
  if (hostMatch) {
    return { kind: 'host-info', hostId: hostMatch[1] }
  }

  // /activity
  if (pathname === '/activity') {
    return { kind: 'recent-activity' }
  }

  // /create-workspace
  if (pathname === '/create-workspace') {
    return { kind: 'create-workspace' }
  }

  // /create-agent
  if (pathname === '/create-agent') {
    return { kind: 'create-agent' }
  }

  // Default
  return { kind: 'welcome' }
}
