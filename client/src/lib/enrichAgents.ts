import type { AgentInfo, HostInfo } from './types'

/**
 * Enrich agents with provider info by cross-referencing agents' models
 * against their hosts' models and providers.
 *
 * Rule: an agent's provider is online if:
 *   1. The host is online, AND
 *   2. The agent's model name is found in that host's models array.
 */
export function enrichAgents(agents: AgentInfo[], hosts: HostInfo[]): AgentInfo[] {
  const hostMap = new Map(hosts.map(h => [h.id, h]))

  return agents.map(agent => {
    const host = hostMap.get(agent.hostId)
    if (!host) return agent

    const matchedModel = host.models.find(m => m.name === agent.model)
    const providerOnline = host.status === 'online' && matchedModel !== undefined
    const provider = matchedModel?.provider

    return { ...agent, provider, providerOnline }
  })
}
