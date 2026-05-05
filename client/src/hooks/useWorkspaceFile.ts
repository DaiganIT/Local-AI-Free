import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AgentFolderTreeResponse } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface WorkspaceFileResponse {
  content: string
  kind: 'text' | 'image'
  path: string
}

/**
 * Fetch the workspace folder tree from the relay.
 * Reuses AgentFolderTreeResponse type (same shape).
 * Enabled only when workspaceId and hostId are both provided.
 */
export function useWorkspaceFolderTree(workspaceId: string, hostId: string) {
  return useQuery<AgentFolderTreeResponse>({
    queryKey: ['workspace-folder-tree', workspaceId, hostId] as const,
    queryFn: async () => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/folder-tree?hostId=${encodeURIComponent(hostId)}`,
        { headers: headers() },
      )
      if (!res.ok) throw new Error(`Failed to load workspace tree: ${res.status}`)
      return res.json()
    },
    enabled: !!workspaceId && !!hostId,
    staleTime: 15_000,
  })
}

/**
 * Fetch a workspace file from the relay.
 * Enabled only when workspaceId, hostId, and path are all provided.
 */
export function useWorkspaceFile(workspaceId: string, hostId: string, path: string | undefined) {
  return useQuery<WorkspaceFileResponse>({
    queryKey: ['workspace-file', workspaceId, hostId, path] as const,
    queryFn: async () => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/file?path=${encodeURIComponent(path!)}&hostId=${encodeURIComponent(hostId)}`,
        { headers: headers() },
      )
      if (!res.ok) throw new Error(`Failed to load file: ${res.status}`)
      return res.json()
    },
    enabled: !!workspaceId && !!hostId && !!path,
    staleTime: 5_000,
  })
}

/**
 * Save (write) a workspace file via the relay.
 * Invalidates the file query and folder tree on success.
 */
export function useSaveWorkspaceFile(workspaceId: string, hostId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/file`,
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
      // Invalidate the file query so it refetches
      queryClient.invalidateQueries({
        queryKey: ['workspace-file', workspaceId, hostId, variables.path],
      })
      // Also invalidate the folder tree since a new file may have been created
      queryClient.invalidateQueries({
        queryKey: ['workspace-folder-tree', workspaceId, hostId],
      })
    },
  })
}
