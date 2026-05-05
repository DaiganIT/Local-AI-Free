import { useMutation, useQueryClient } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (agentId: string) =>
      fetch(`${RELAY_URL}/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: headers(),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete agent: ${r.status}`)
        return r.json()
      }),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.removeQueries({ queryKey: ['agents', agentId] })
    },
  })
}
