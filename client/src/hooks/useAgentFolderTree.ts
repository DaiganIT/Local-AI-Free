import { useQuery } from '@tanstack/react-query'
import type { AgentFolderTreeResponse } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useAgentFolderTree(agentId: string) {
  return useQuery<AgentFolderTreeResponse>({
    queryKey: ['agents', agentId, 'folder-tree'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents/${encodeURIComponent(agentId)}/folder-tree`, {
        headers: headers(),
      })
      if (!res.ok) throw new Error(`Failed to load workspace tree: ${res.status}`)
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 15_000,
  })
}
