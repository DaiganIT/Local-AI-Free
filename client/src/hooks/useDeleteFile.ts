import { useMutation, useQueryClient } from '@tanstack/react-query'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface DeleteFileResponse {
  success: boolean
  path: string
}

/**
 * Delete an agent file from the relay.
 * Invalidates the folder tree and removes the file query on success.
 */
export function useDeleteAgentFile(agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const res = await fetch(
        `${RELAY_URL}/api/agents/${encodeURIComponent(agentId)}/file?path=${encodeURIComponent(path)}`,
        {
          method: 'DELETE',
          headers: headers(),
        },
      )
      if (!res.ok) throw new Error(`Failed to delete file: ${res.status}`)
      return res.json() as Promise<DeleteFileResponse>
    },
    onSuccess: (_data) => {
      // Remove the specific file query cache
      queryClient.removeQueries({
        queryKey: ['agent-file', agentId],
        // Match any hostId + the deleted path
        exact: false,
      })
      // Invalidate the folder tree so it refetches
      queryClient.invalidateQueries({
        queryKey: ['agents', agentId, 'folder-tree'],
      })
    },
  })
}

/**
 * Delete a workspace file from the relay.
 * Invalidates the folder tree and removes the file query on success.
 */
export function useDeleteWorkspaceFile(workspaceId: string, hostId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/file?hostId=${encodeURIComponent(hostId)}&path=${encodeURIComponent(path)}`,
        {
          method: 'DELETE',
          headers: headers(),
        },
      )
      if (!res.ok) throw new Error(`Failed to delete file: ${res.status}`)
      return res.json() as Promise<DeleteFileResponse>
    },
    onSuccess: (_data, variables) => {
      // Remove the specific file query cache
      queryClient.removeQueries({
        queryKey: ['workspace-file', workspaceId, hostId, variables.path],
      })
      // Invalidate the folder tree so it refetches
      queryClient.invalidateQueries({
        queryKey: ['workspace-folder-tree', workspaceId, hostId],
      })
    },
  })
}
