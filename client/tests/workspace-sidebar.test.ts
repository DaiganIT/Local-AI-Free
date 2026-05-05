import { describe, it, expect } from 'vitest'
import type { ChannelKind } from '#/components/ChannelSidebar'
import { nav, parsePath } from '#/lib/navigation'

describe('ChannelKind workspace type', () => {
  it('accepts workspace selection', () => {
    const sel: ChannelKind = { kind: 'workspace', id: 'ws-1', hostId: 'host-1' }
    expect(sel.kind).toBe('workspace')
    if (sel.kind === 'workspace') {
      expect(sel.id).toBe('ws-1')
      expect(sel.hostId).toBe('host-1')
    }
  })

  it('workspace selection is distinct from other kinds', () => {
    const ws: ChannelKind = { kind: 'workspace', id: 'ws-1', hostId: 'host-1' }
    const agent: ChannelKind = { kind: 'agent', id: 'ws-1', hostId: 'host-1' }
    expect(ws.kind).not.toBe(agent.kind)
  })
})

describe('Navigation helpers for workspace routes', () => {
  it('generates workspace path', () => {
    expect(nav.workspace('host-1', 'ws-1')).toBe('/hosts/host-1/w/ws-1')
  })

  it('parses /hosts/host-1/w/ws-1 as workspace', () => {
    expect(parsePath('/hosts/host-1/w/ws-1')).toEqual({
      kind: 'workspace',
      hostId: 'host-1',
      workspaceId: 'ws-1',
    })
  })

  it('parses /hosts/my-host/w/my-workspace as workspace', () => {
    expect(parsePath('/hosts/my-host/w/my-workspace')).toEqual({
      kind: 'workspace',
      hostId: 'my-host',
      workspaceId: 'my-workspace',
    })
  })

  it('generates create-workspace path', () => {
    expect(nav.createWorkspace()).toBe('/create-workspace')
  })

  it('parses /create-workspace as create-workspace', () => {
    expect(parsePath('/create-workspace')).toEqual({ kind: 'create-workspace' })
  })
})
