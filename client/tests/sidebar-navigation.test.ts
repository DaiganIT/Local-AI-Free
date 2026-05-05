import { describe, it, expect } from 'vitest'
import type { SidebarSelection } from '#/lib/types'
import { mockHosts, mockAgents, mockMessages } from '#/lib/mockData'

describe('Sidebar navigation types', () => {
  it('accepts null (welcome/home view)', () => {
    const sel: SidebarSelection = null
    expect(sel).toBeNull()
  })

  it('accepts agent selection', () => {
    const sel: SidebarSelection = { kind: 'agent', id: 'agent-1' }
    expect(sel).not.toBeNull()
    expect(sel.kind).toBe('agent')
    if (sel?.kind === 'agent') expect(sel.id).toBe('agent-1')
  })

  it('accepts host-info selection', () => {
    const sel: SidebarSelection = { kind: 'host-info', hostId: 'host-1' }
    expect(sel).not.toBeNull()
    expect(sel.kind).toBe('host-info')
    if (sel?.kind === 'host-info') expect(sel.hostId).toBe('host-1')
  })

  it('accepts recent-activity selection', () => {
    const sel: SidebarSelection = { kind: 'recent-activity' }
    expect(sel).not.toBeNull()
    expect(sel.kind).toBe('recent-activity')
  })
})

describe('Mock data consistency', () => {
  it('every agent references an existing host', () => {
    const hostIds = new Set(mockHosts.map((h) => h.id))
    for (const [_hostId, agents] of Object.entries(mockAgents)) {
      for (const agent of agents) {
        expect(hostIds.has(agent.hostId)).toBe(true)
      }
    }
  })

  it('mock message agentIds reference real agents', () => {
    const agentIds = new Set(
      Object.values(mockAgents)
        .flat()
        .map((a) => a.id),
    )
    for (const [_key, messages] of Object.entries(mockMessages)) {
      for (const msg of messages) {
        expect(agentIds.has(msg.agentId)).toBe(true)
      }
    }
  })
})
