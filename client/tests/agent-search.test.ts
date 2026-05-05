import { describe, it, expect } from 'vitest'
import { nav, parsePath, agentSearchString, type AgentSearch } from '#/lib/navigation'

describe('nav.agent with search', () => {
  it('generates agent path without search', () => {
    expect(nav.agent('host-1', 'agent-1')).toBe('/hosts/host-1/a/agent-1')
  })

  it('generates agent path with file search param', () => {
    expect(nav.agent('host-1', 'agent-1', { file: 'src/index.ts' })).toBe(
      '/hosts/host-1/a/agent-1?file=src%2Findex.ts',
    )
  })

  it('omits file when empty string', () => {
    expect(nav.agent('host-1', 'agent-1', { file: '' })).toBe(
      '/hosts/host-1/a/agent-1',
    )
  })
})

describe('nav.chat with search', () => {
  it('generates chat path without search', () => {
    expect(nav.chat('host-1', 'agent-1', 'chat-abc')).toBe(
      '/hosts/host-1/a/agent-1/c/chat-abc',
    )
  })

  it('generates chat path with file search param', () => {
    expect(nav.chat('host-1', 'agent-1', 'chat-abc', { file: 'notes.md' })).toBe(
      '/hosts/host-1/a/agent-1/c/chat-abc?file=notes.md',
    )
  })
})

describe('agentSearchString', () => {
  it('serializes file param', () => {
    expect(agentSearchString({ file: 'AGENTS.md' })).toBe('file=AGENTS.md')
  })

  it('encodes slashes in file param', () => {
    expect(agentSearchString({ file: 'src/lib/utils.ts' })).toBe(
      'file=src%2Flib%2Futils.ts',
    )
  })

  it('returns empty string for no file', () => {
    expect(agentSearchString({})).toBe('')
  })
})

describe('parsePath with file search param', () => {
  it('parses agent path with file param', () => {
    expect(parsePath('/hosts/host-1/a/agent-1?file=README.md')).toEqual({
      kind: 'agent',
      hostId: 'host-1',
      agentId: 'agent-1',
      file: 'README.md',
    })
  })

  it('parses agent path with encoded file param', () => {
    expect(parsePath('/hosts/host-1/a/agent-1?file=src%2Findex.ts')).toEqual({
      kind: 'agent',
      hostId: 'host-1',
      agentId: 'agent-1',
      file: 'src/index.ts',
    })
  })

  it('parses agent path without file param (no file key)', () => {
    expect(parsePath('/hosts/host-1/a/agent-1')).toEqual({
      kind: 'agent',
      hostId: 'host-1',
      agentId: 'agent-1',
      file: undefined,
    })
  })

  it('parses chat path with file param', () => {
    expect(parsePath('/hosts/host-1/a/agent-1/c/chat-abc?file=notes.md')).toEqual({
      kind: 'chat',
      hostId: 'host-1',
      agentId: 'agent-1',
      chatId: 'chat-abc',
      file: 'notes.md',
    })
  })

  it('existing test: parses /hosts/host-1/a/agent-1 without search still works', () => {
    expect(parsePath('/hosts/host-1/a/agent-1')).toEqual({
      kind: 'agent',
      hostId: 'host-1',
      agentId: 'agent-1',
      file: undefined,
    })
  })
})
