import { describe, it, expect } from 'vitest'
import { nav, parsePath } from '#/lib/navigation'

describe('navigation helpers', () => {
  it('generates home path', () => {
    expect(nav.home()).toBe('/')
  })

  it('generates host info path', () => {
    expect(nav.host('host-1')).toBe('/hosts/host-1')
  })

  it('generates agent chat path', () => {
    expect(nav.agent('host-1', 'agent-1')).toBe('/hosts/host-1/a/agent-1')
  })

  it('generates activity path', () => {
    expect(nav.activity()).toBe('/activity')
  })

  it('generates create-agent path', () => {
    expect(nav.createAgent()).toBe('/create-agent')
  })
})

describe('parsePath', () => {
  it('parses / as welcome', () => {
    expect(parsePath('/')).toEqual({ kind: 'welcome' })
  })

  it('parses /activity as recent-activity', () => {
    expect(parsePath('/activity')).toEqual({ kind: 'recent-activity' })
  })

  it('parses /hosts/host-1 as host-info', () => {
    expect(parsePath('/hosts/host-1')).toEqual({
      kind: 'host-info',
      hostId: 'host-1',
    })
  })

  it('parses /hosts/host-1/a/agent-1 as agent chat', () => {
    expect(parsePath('/hosts/host-1/a/agent-1')).toEqual({
      kind: 'agent',
      hostId: 'host-1',
      agentId: 'agent-1',
    })
  })

  it('falls back to welcome for unknown paths', () => {
    expect(parsePath('/some/unknown/route')).toEqual({ kind: 'welcome' })
  })

  it('parses /create-agent as create-agent', () => {
    expect(parsePath('/create-agent')).toEqual({ kind: 'create-agent' })
  })

  it('parses agent path with hyphenated ids', () => {
    expect(parsePath('/hosts/my-host-123/a/my-agent-456')).toEqual({
      kind: 'agent',
      hostId: 'my-host-123',
      agentId: 'my-agent-456',
    })
  })

  it('generates chat path', () => {
    expect(nav.chat('host-1', 'agent-1', 'chat-abc')).toBe('/hosts/host-1/a/agent-1/c/chat-abc')
  })

  it('parses /hosts/host-1/a/agent-1/c/chat-abc as chat', () => {
    expect(parsePath('/hosts/host-1/a/agent-1/c/chat-abc')).toEqual({
      kind: 'chat',
      hostId: 'host-1',
      agentId: 'agent-1',
      chatId: 'chat-abc',
    })
  })

  it('generates workspace path', () => {
    expect(nav.workspace('host-1', 'ws-1')).toBe('/hosts/host-1/w/ws-1')
  })

  it('generates workspace chat path', () => {
    expect(nav.workspaceChat('host-1', 'ws-1', 'wchat-1')).toBe('/hosts/host-1/w/ws-1/c/wchat-1')
  })

  it('parses /hosts/host-1/w/ws-1 as workspace', () => {
    expect(parsePath('/hosts/host-1/w/ws-1')).toEqual({
      kind: 'workspace',
      hostId: 'host-1',
      workspaceId: 'ws-1',
    })
  })

  it('parses /hosts/host-1/w/ws-1/c/wchat-1 as workspace-chat', () => {
    expect(parsePath('/hosts/host-1/w/ws-1/c/wchat-1')).toEqual({
      kind: 'workspace-chat',
      hostId: 'host-1',
      workspaceId: 'ws-1',
      workspaceChatId: 'wchat-1',
    })
  })
})
