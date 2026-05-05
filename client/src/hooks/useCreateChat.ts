import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Chat } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useCreateChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, title }: { agentId: string; title?: string }) =>
      fetch(`${RELAY_URL}/api/agents/${agentId}/chats`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to create chat: ${r.status}`)
        return r.json() as Promise<Chat>
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chats', data.agentId] })
    },
  })
}
