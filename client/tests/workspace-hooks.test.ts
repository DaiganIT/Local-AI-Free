import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useWorkspaces,
  useWorkspaceAgents,
  useCreateWorkspace,
  useDeleteWorkspace,
  useAddAgentToWorkspace,
  useRemoveAgentFromWorkspace,
} from '#/hooks/useWorkspaces'
import type { WorkspaceInfo } from '#/lib/types'

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

const mockWorkspace: WorkspaceInfo = {
  id: 'ws-1',
  hostId: 'host-1',
  name: 'My Workspace',
  alias: 'my-workspace',
  path: 'my-workspace',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches all workspaces from /api/workspaces', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([mockWorkspace]),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockWorkspace])
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces'),
      expect.anything(),
    )
  })

  it('filters by hostId when provided', async () => {
    const ws1 = { ...mockWorkspace, hostId: 'host-1' }
    const ws2 = { ...mockWorkspace, id: 'ws-2', hostId: 'host-2' }
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([ws1, ws2]),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaces('host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([ws1])
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaces(), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to fetch workspaces')
  })
})

describe('useCreateWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/workspaces and returns the created workspace', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockWorkspace),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      hostId: 'host-1',
      name: 'My Workspace',
      path: 'my-workspace',
    })

    expect(response).toEqual(mockWorkspace)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hostId: 'host-1', name: 'My Workspace', path: 'my-workspace' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ hostId: 'host-1', name: 'Test' }),
    ).rejects.toThrow('Failed to create workspace: 400')
  })

  it('invalidates workspaces query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockWorkspace),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspaces'], [])

    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ hostId: 'host-1', name: 'Test' })

    const state = qc.getQueryState(['workspaces'])
    expect(state?.isInvalidated).toBe(true)
  })
})

describe('useDeleteWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls DELETE /api/workspaces/:id and returns the response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      workspaceId: 'ws-1',
      hostId: 'host-1',
    })

    expect(response).toEqual({ success: true })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ hostId: 'host-1' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ workspaceId: 'ws-1', hostId: 'host-1' }),
    ).rejects.toThrow('Failed to delete workspace: 502')
  })

  it('invalidates workspaces query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspaces'], [mockWorkspace])

    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ workspaceId: 'ws-1', hostId: 'host-1' })

    const state = qc.getQueryState(['workspaces'])
    expect(state?.isInvalidated).toBe(true)
  })
})

describe('useAddAgentToWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/workspaces/:id/agents and returns the response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useAddAgentToWorkspace(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      hostId: 'host-1',
    })

    expect(response).toEqual({ success: true })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/agents'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentId: 'agent-1', hostId: 'host-1' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useAddAgentToWorkspace(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ workspaceId: 'ws-1', agentId: 'agent-1', hostId: 'host-1' }),
    ).rejects.toThrow('Failed to add agent to workspace: 400')
  })

  it('invalidates workspaces query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspaces'], [mockWorkspace])

    const { result } = renderHook(() => useAddAgentToWorkspace(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ workspaceId: 'ws-1', agentId: 'agent-1', hostId: 'host-1' })

    const state = qc.getQueryState(['workspaces'])
    expect(state?.isInvalidated).toBe(true)
  })
})

describe('useRemoveAgentFromWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls DELETE /api/workspaces/:id/agents/:agentId and returns the response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useRemoveAgentFromWorkspace(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      hostId: 'host-1',
    })

    expect(response).toEqual({ success: true })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/agents/agent-1'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ hostId: 'host-1' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useRemoveAgentFromWorkspace(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ workspaceId: 'ws-1', agentId: 'agent-1', hostId: 'host-1' }),
    ).rejects.toThrow('Failed to remove agent from workspace: 400')
  })

  it('invalidates workspaces query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspaces'], [mockWorkspace])

    const { result } = renderHook(() => useRemoveAgentFromWorkspace(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ workspaceId: 'ws-1', agentId: 'agent-1', hostId: 'host-1' })

    const state = qc.getQueryState(['workspaces'])
    expect(state?.isInvalidated).toBe(true)
  })
})

// ── useWorkspaceAgents ────────────────────────────────────────────────────

describe('useWorkspaceAgents', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches agent IDs from /api/workspaces/:id/agents?hostId=...', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(['agent-1', 'agent-2']),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceAgents('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(['agent-1', 'agent-2'])
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/agents?hostId=host-1'),
      expect.anything(),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceAgents('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to fetch workspace agents')
  })
})
