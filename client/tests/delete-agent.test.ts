import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDeleteAgent } from '#/hooks/useDeleteAgent'
import React from 'react'

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

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useDeleteAgent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls DELETE /api/agents/:agentId and returns the response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useDeleteAgent(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync('agent-123')

    expect(response).toEqual({ success: true })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agents/agent-123'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws when the server responds with an error status', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useDeleteAgent(), {
      wrapper: wrapper(qc),
    })

    await expect(result.current.mutateAsync('agent-123')).rejects.toThrow(
      'Failed to delete agent: 500',
    )
  })

  it('invalidates the agents query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    // Seed the query so it exists for invalidation to affect
    qc.setQueryData(['agents'], [{ id: 'agent-123', name: 'Test' }])

    const { result } = renderHook(() => useDeleteAgent(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync('agent-123')

    // invalidateQueries marks the query as invalidated (isInvalidated = true)
    const state = qc.getQueryState(['agents'])
    expect(state?.isInvalidated).toBe(true)
  })

  it('removes the individual agent query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['agents', 'agent-123'], { id: 'agent-123', name: 'Test' })

    const { result } = renderHook(() => useDeleteAgent(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync('agent-123')

    expect(qc.getQueryData(['agents', 'agent-123'])).toBeUndefined()
  })
})
