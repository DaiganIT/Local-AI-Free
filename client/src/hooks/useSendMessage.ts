import { useMutation, useQueryClient } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, prompt, chatId }: { agentId: string; prompt: string; chatId?: string }) =>
      fetch(`${RELAY_URL}/api/chat`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ agentId, prompt, chatId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to send message: ${r.status}`)
        return r.json() as Promise<{ response: string; agentId?: string; chatId?: string; userMessageId?: string }>
      }),
    onSuccess: (_data, variables) => {
      if (variables.chatId) {
        queryClient.invalidateQueries({ queryKey: ['chat-detail', variables.chatId] })
      }
    },
  })
}
