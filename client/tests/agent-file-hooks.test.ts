import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAgentFile, useSaveAgentFile } from '#/hooks/useAgentFile'

// ── Test helpers ──────────────────────────────────────────────────────────

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

const mockFileResponse = {
  content: 'hello world',
  kind: 'text' as const,
  path: 'test.txt',
}

// ── useAgentFile ──────────────────────────────────────────────────────────

describe('useAgentFile', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('is disabled when path is undefined', () => {
    const qc = createQueryClient()
    const { result } = renderHook(
      () => useAgentFile('agent-1', 'host-1', undefined),
      { wrapper: wrapper(qc) },
    )
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('is disabled when agentId is empty', () => {
    const qc = createQueryClient()
    const { result } = renderHook(
      () => useAgentFile('', 'host-1', 'test.txt'),
      { wrapper: wrapper(qc) },
    )
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches agent file from the relay', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockFileResponse),
    })

    const qc = createQueryClient()
    const { result } = renderHook(
      () => useAgentFile('agent-1', 'host-1', 'test.txt'),
      { wrapper: wrapper(qc) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agents/agent-1/file?path=test.txt&hostId=host-1'),
      expect.any(Object),
    )
    expect(result.current.data?.content).toBe('hello world')
  })

  it('throws on error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const qc = createQueryClient()
    const { result } = renderHook(
      () => useAgentFile('agent-1', 'host-1', 'test.txt'),
      { wrapper: wrapper(qc) },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('500')
  })
})

// ── useSaveAgentFile ──────────────────────────────────────────────────────

describe('useSaveAgentFile', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sends PUT request to save agent file', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    const qc = createQueryClient()
    const { result } = renderHook(
      () => useSaveAgentFile('agent-1', 'host-1'),
      { wrapper: wrapper(qc) },
    )

    result.current.mutate({ path: 'test.txt', content: 'new content' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agents/agent-1/file'),
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
