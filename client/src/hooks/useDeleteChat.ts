import { useMutation, useQueryClient } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useDeleteChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chatId: string) =>
      fetch(`${RELAY_URL}/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: headers(),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete chat: ${r.status}`)
        return r.json()
      }),
    onSuccess: (_data, chatId) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      queryClient.removeQueries({ queryKey: ['chat-detail', chatId] })
    },
  })
}
