import { useQuery } from '@tanstack/react-query'
import type { AgentInfo } from '#/lib/types'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export function useAgents() {
  return useQuery<AgentInfo[]>({
    queryKey: ['agents'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useAgent(agentId: string) {
  return useQuery<AgentInfo>({
    queryKey: ['agents', agentId] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`)
      const all: AgentInfo[] = await res.json()
      const agent = all.find((a) => a.id === agentId)
      if (!agent) throw new Error(`Agent "${agentId}" not found`)
      return agent
    },
    enabled: !!agentId,
    staleTime: 30_000,
  })
}

export function useHostAgents(hostId: string) {
  return useQuery<AgentInfo[]>({
    queryKey: ['hosts', hostId, 'agents'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`)
      const all: AgentInfo[] = await res.json()
      return all.filter((a) => a.hostId === hostId)
    },
    enabled: !!hostId,
    staleTime: 60_000,
  })
}

export function useAgentInstructions(agentId: string) {
  return useQuery<{ instructions: string }>({
    queryKey: ['agents', agentId, 'instructions'] as const,
    queryFn: async () => {
      const res = await fetch(`${RELAY_URL}/api/agents/${agentId}/instructions`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to fetch instructions: ${res.status}`)
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 30_000,
  })
}
