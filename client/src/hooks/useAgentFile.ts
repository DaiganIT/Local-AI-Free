import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface AgentFileResponse {
  content: string
  kind: 'text' | 'image'
  path: string
}

/**
 * Fetch an agent file from the relay.
 * Enabled only when agentId, hostId, and path are all provided.
 */
export function useAgentFile(agentId: string, hostId: string, path: string | undefined) {
  return useQuery<AgentFileResponse>({
    queryKey: ['agent-file', agentId, hostId, path] as const,
    queryFn: async () => {
      const res = await fetch(
        `${RELAY_URL}/api/agents/${encodeURIComponent(agentId)}/file?path=${encodeURIComponent(path!)}&hostId=${encodeURIComponent(hostId)}`,
        { headers: headers() },
      )
      if (!res.ok) throw new Error(`Failed to load file: ${res.status}`)
      return res.json()
    },
    enabled: !!agentId && !!hostId && !!path,
    staleTime: 5_000,
  })
}

/**
 * Save (write) an agent file via the relay.
 * Invalidates the file query and folder tree on success.
 */
export function useSaveAgentFile(agentId: string, hostId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await fetch(
        `${RELAY_URL}/api/agents/${encodeURIComponent(agentId)}/file`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({ hostId, path, content }),
        },
      )
      if (!res.ok) throw new Error(`Failed to save file: ${res.status}`)
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['agent-file', agentId, hostId, variables.path],
      })
      queryClient.invalidateQueries({
        queryKey: ['agents', agentId, 'folder-tree'],
      })
    },
  })
}
