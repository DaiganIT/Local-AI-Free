import { useQuery } from '@tanstack/react-query'
import type { AgentInfo, HostInfo } from '#/lib/types'
import { enrichAgents } from '#/lib/enrichAgents'

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
      const [agentsRes, hostsRes] = await Promise.all([
        fetch(`${RELAY_URL}/api/agents`, { headers: headers() }),
        fetch(`${RELAY_URL}/hosts`, { headers: headers() }),
      ])
      if (!agentsRes.ok) throw new Error(`Failed to fetch agents: ${agentsRes.status}`)
      if (!hostsRes.ok) throw new Error(`Failed to fetch hosts: ${hostsRes.status}`)
      const agents = await agentsRes.json() as AgentInfo[]
      const hosts = await hostsRes.json() as HostInfo[]
      return enrichAgents(agents, hosts)
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useAgent(agentId: string) {
  return useQuery<AgentInfo>({
    queryKey: ['agents', agentId] as const,
    queryFn: async () => {
      const [agentsRes, hostsRes] = await Promise.all([
        fetch(`${RELAY_URL}/api/agents`, { headers: headers() }),
        fetch(`${RELAY_URL}/hosts`, { headers: headers() }),
      ])
      if (!agentsRes.ok) throw new Error(`Failed to fetch agents: ${agentsRes.status}`)
      const allAgents = await agentsRes.json() as AgentInfo[]
      const agent = allAgents.find((a) => a.id === agentId)
      if (!agent) throw new Error(`Agent "${agentId}" not found`)
      if (hostsRes.ok) {
        const hosts = await hostsRes.json() as HostInfo[]
        return enrichAgents([agent], hosts)[0]
      }
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
      const [agentsRes, hostsRes] = await Promise.all([
        fetch(`${RELAY_URL}/api/agents`, { headers: headers() }),
        fetch(`${RELAY_URL}/hosts`, { headers: headers() }),
      ])
      if (!agentsRes.ok) throw new Error(`Failed to fetch agents: ${agentsRes.status}`)
      const allAgents = await agentsRes.json() as AgentInfo[]
      const hostAgents = allAgents.filter((a) => a.hostId === hostId)
      if (hostsRes.ok) {
        const hosts = await hostsRes.json() as HostInfo[]
        return enrichAgents(hostAgents, hosts)
      }
      return hostAgents
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
