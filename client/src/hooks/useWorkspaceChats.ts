import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceChat, WorkspaceChatDetail, WorkspaceMessage, SendWorkspaceMessageResponse, Attachment } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

// ── useWorkspaceChats — list chats for a workspace ────────────────────────

export function useWorkspaceChats(workspaceId: string, hostId: string) {
  return useQuery<WorkspaceChat[]>({
    queryKey: ['workspace-chats', workspaceId, hostId] as const,
    queryFn: async () => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${workspaceId}/chats?hostId=${encodeURIComponent(hostId)}`,
        { headers: headers() },
      )
      if (!res.ok) throw new Error(`Failed to fetch workspace chats: ${res.status}`)
      return res.json() as Promise<WorkspaceChat[]>
    },
    enabled: !!workspaceId && !!hostId,
    staleTime: 30_000,
  })
}

// ── useWorkspaceChatDetail — get a chat with messages ─────────────────────

export function useWorkspaceChatDetail(chatId: string) {
  return useQuery<WorkspaceChatDetail>({
    queryKey: ['workspace-chat-detail', chatId] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/workspace-chats/${chatId}`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch workspace chat: ${res.status}`)
      const raw = await res.json() as {
        chat: WorkspaceChat
        messages: Array<Omit<WorkspaceMessage, 'attachments'> & { attachments?: Attachment[] | null }>
      }
      // Map attachments into each message
      return {
        chat: raw.chat,
        messages: raw.messages.map((m) => ({ ...m, attachments: m.attachments ?? null })),
      } as WorkspaceChatDetail
    },
    enabled: !!chatId,
    staleTime: 0,
  })
}

// ── useCreateWorkspaceChat — create a new workspace chat ──────────────────

export function useCreateWorkspaceChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, hostId, title }: { workspaceId: string; hostId: string; title?: string }) =>
      fetch(`${RELAY_URL}/api/workspaces/${workspaceId}/chats`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ hostId, title }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to create workspace chat: ${r.status}`)
        return r.json() as Promise<WorkspaceChat>
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-chats', variables.workspaceId, variables.hostId] })
    },
  })
}

// ── useSendWorkspaceMessage — send a message to mentioned agents ──────────

export function useSendWorkspaceMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ chatId, prompt, agentIds }: { chatId: string; prompt: string; agentIds: string[] }) =>
      fetch(`${RELAY_URL}/api/workspace-chats/${chatId}/messages`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ prompt, agentIds }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to send workspace message: ${r.status}`)
        return r.json() as Promise<SendWorkspaceMessageResponse>
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-chat-detail', variables.chatId] })
    },
  })
}
