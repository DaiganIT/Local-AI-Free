import { describe, it, expect } from 'vitest'
import { enrichAgents } from './enrichAgents'
import type { AgentInfo, HostInfo } from './types'

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    hostId: 'host-1',
    name: 'Test Agent',
    model: 'llama3.2:3b',
    status: 'idle',
    ...overrides,
  }
}

function host(overrides: Partial<HostInfo> = {}): HostInfo {
  return {
    id: 'host-1',
    hostname: 'test-host',
    connectedAt: '2025-01-01T00:00:00Z',
    lastHeartbeat: '2025-01-01T00:00:05Z',
    status: 'online',
    providers: [{ name: 'ollama', version: '0.9.0' }],
    models: [
      { name: 'llama3.2:3b', size: 2000000000, provider: 'ollama' },
      { name: 'phi3:3.8b', size: 2200000000, provider: 'ollama' },
    ],
    ...overrides,
  }
}

describe('enrichAgents', () => {
  it('sets provider and providerOnline=true when host online and model matches', () => {
    const result = enrichAgents([agent()], [host()])
    expect(result[0].provider).toBe('ollama')
    expect(result[0].providerOnline).toBe(true)
  })

  it('sets providerOnline=false when host is offline even if model matches', () => {
    const result = enrichAgents(
      [agent()],
      [host({ status: 'offline' })],
    )
    expect(result[0].provider).toBe('ollama')
    expect(result[0].providerOnline).toBe(false)
  })

  it('sets providerOnline=false when model not in host.models', () => {
    const result = enrichAgents(
      [agent({ model: 'unknown-model' })],
      [host()],
    )
    expect(result[0].provider).toBeUndefined()
    expect(result[0].providerOnline).toBe(false)
  })

  it('leaves provider and providerOnline undefined when host not found', () => {
    const result = enrichAgents(
      [agent({ hostId: 'nonexistent' })],
      [host()],
    )
    expect(result[0].provider).toBeUndefined()
    expect(result[0].providerOnline).toBeUndefined()
  })

  it('enriches multiple agents from multiple hosts', () => {
    const agents: AgentInfo[] = [
      agent({ id: 'agent-1', model: 'llama3.2:3b' }),
      agent({ id: 'agent-2', hostId: 'host-2', model: 'qwen2.5:14b' }),
    ]
    const hosts: HostInfo[] = [
      host(),
      host({
        id: 'host-2',
        hostname: 'host-2',
        providers: [{ name: 'ollama', version: '0.8.0' }],
        models: [
          { name: 'qwen2.5:14b', size: 9000000000, provider: 'ollama' },
        ],
      }),
    ]
    const result = enrichAgents(agents, hosts)
    expect(result[0].providerOnline).toBe(true)
    expect(result[1].providerOnline).toBe(true)
    expect(result[1].provider).toBe('ollama')
  })

  it('does not mutate original agents', () => {
    const original = agent()
    enrichAgents([original], [host()])
    expect(original.provider).toBeUndefined()
    expect(original.providerOnline).toBeUndefined()
  })
})
