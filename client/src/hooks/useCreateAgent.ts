import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AgentInfo } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ hostId, name, model, instructions, tools, skills }: {
      hostId: string
      name: string
      model: string
      instructions?: string
      tools?: string[]
      skills?: { name: string; description: string }[]
    }) =>
      fetch(`${RELAY_URL}/api/agents`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ hostId, name, model, instructions, tools, skills }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to create agent: ${r.status}`)
        return r.json() as Promise<AgentInfo>
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}
