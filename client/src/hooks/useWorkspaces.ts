import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceInfo } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

// ── useWorkspaces — list all workspaces (optionally filtered by hostId) ───

export function useWorkspaces(hostId?: string) {
  return useQuery<WorkspaceInfo[]>({
    queryKey: hostId ? ['hosts', hostId, 'workspaces'] as const : ['workspaces'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/workspaces`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch workspaces: ${res.status}`)
      const all: WorkspaceInfo[] = await res.json()
      if (!hostId) return all
      return all.filter((w) => w.hostId === hostId)
    },
    staleTime: 60_000,
    retry: false,
  })
}

// ── useCreateWorkspace ────────────────────────────────────────────────────

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ hostId, name, path }: { hostId: string; name: string; path?: string }) =>
      fetch(`${RELAY_URL}/api/workspaces`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ hostId, name, path }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to create workspace: ${r.status}`)
        return r.json() as Promise<WorkspaceInfo>
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

// ── useWorkspaceAgents — list agent IDs for a workspace ──────────────────

export function useWorkspaceAgents(workspaceId: string, hostId: string) {
  return useQuery<string[]>({
    queryKey: ['workspaces', workspaceId, 'agents', hostId] as const,
    queryFn: async () => {
      const res = await fetch(
        `${RELAY_URL}/api/workspaces/${workspaceId}/agents?hostId=${encodeURIComponent(hostId)}`,
        { headers: headers() },
      )
      if (!res.ok) throw new Error(`Failed to fetch workspace agents: ${res.status}`)
      return res.json() as Promise<string[]>
    },
    staleTime: 60_000,
    retry: false,
  })
}

// ── useDeleteWorkspace ────────────────────────────────────────────────────

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, hostId }: { workspaceId: string; hostId: string }) =>
      fetch(`${RELAY_URL}/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ hostId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to delete workspace: ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

// ── useAddAgentToWorkspace ────────────────────────────────────────────────

export function useAddAgentToWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, agentId, hostId }: { workspaceId: string; agentId: string; hostId: string }) =>
      fetch(`${RELAY_URL}/api/workspaces/${workspaceId}/agents`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ agentId, hostId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to add agent to workspace: ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

// ── useRemoveAgentFromWorkspace ───────────────────────────────────────────

export function useRemoveAgentFromWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, agentId, hostId }: { workspaceId: string; agentId: string; hostId: string }) =>
      fetch(`${RELAY_URL}/api/workspaces/${workspaceId}/agents/${agentId}`, {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ hostId }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Failed to remove agent from workspace: ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}
