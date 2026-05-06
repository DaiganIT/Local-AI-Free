import { useQuery } from '@tanstack/react-query'
import type { Chat, ChatDetail, Attachment } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useChatDetail(chatId: string) {
  return useQuery<ChatDetail>({
    queryKey: ['chat-detail', chatId] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/chats/${chatId}`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch chat: ${res.status}`)
      const raw = await res.json() as {
        chat: { id: string; agentId: string; title: string; createdAt: string; updatedAt: string; }
        messages: { id: string; chatId: string; role: string; content: string; createdAt: string; thinkingContent?: string | null; attachments?: Attachment[] | null }[]
        totalIn?: number
        totalOut?: number
        totalReasoning?: number
        contextUsed?: number
        contextLength?: number
      }
      const chat: Chat = {
        id: raw.chat.id,
        agentId: raw.chat.agentId,
        title: raw.chat.title,
        createdAt: raw.chat.createdAt,
        updatedAt: raw.chat.updatedAt,
      }
      return {
        chat,
        messages: raw.messages.map((m) => ({
          id: m.id,
          agentId: raw.chat.agentId,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.createdAt,
          thinking: m.thinkingContent ?? null,
          attachments: m.attachments ?? null,
        })),
        totalIn: raw.totalIn,
        totalOut: raw.totalOut,
        totalReasoning: raw.totalReasoning,
        contextUsed: raw.contextUsed,
        contextLength: raw.contextLength,
      }
    },
    enabled: !!chatId,
    staleTime: 0,
  })
}
