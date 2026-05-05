import { useQuery } from '@tanstack/react-query'
import type { Chat } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useChats(agentId: string) {
  return useQuery<Chat[]>({
    queryKey: ['chats', agentId] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents/${agentId}/chats`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch chats: ${res.status}`)
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 30_000,
  })
}
