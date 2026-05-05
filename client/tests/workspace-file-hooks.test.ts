import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useWorkspaceFolderTree,
  useWorkspaceFile,
  useSaveWorkspaceFile,
} from '#/hooks/useWorkspaceFile'
import type { AgentFolderTreeResponse } from '#/lib/types'

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

const mockFolderTree: AgentFolderTreeResponse = {
  tree: {
    id: 'root',
    name: 'my-workspace',
    kind: 'directory',
    children: [
      { id: 'f1', name: 'readme.md', kind: 'file' },
      { id: 'd1', name: 'src', kind: 'directory', children: [
        { id: 'f2', name: 'main.py', kind: 'file' },
      ]},
    ],
  },
}

const mockFileResponse = {
  content: '# Hello World',
  kind: 'text' as const,
  path: 'readme.md',
}

// ── useWorkspaceFolderTree ────────────────────────────────────────────────

describe('useWorkspaceFolderTree', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches folder tree from /api/workspaces/:workspaceId/folder-tree?hostId=...', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockFolderTree),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceFolderTree('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockFolderTree)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/folder-tree?hostId=host-1'),
      expect.anything(),
    )
  })

  it('is disabled when workspaceId or hostId is empty', () => {
    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceFolderTree('', 'host-1'), {
      wrapper: wrapper(qc),
    })

    expect(result.current.fetchStatus).toBe('idle')

    const { result: result2 } = renderHook(() => useWorkspaceFolderTree('ws-1', ''), {
      wrapper: wrapper(qc),
    })

    expect(result2.current.fetchStatus).toBe('idle')
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceFolderTree('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to load workspace tree')
  })
})

// ── useWorkspaceFile ──────────────────────────────────────────────────────

describe('useWorkspaceFile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches file from /api/workspaces/:workspaceId/file?path=...&hostId=...', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockFileResponse),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceFile('ws-1', 'host-1', 'readme.md'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockFileResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/file?path=readme.md&hostId=host-1'),
      expect.anything(),
    )
  })

  it('is disabled when workspaceId, hostId, or path is empty', () => {
    const qc = createQueryClient()

    const { result } = renderHook(() => useWorkspaceFile('', 'host-1', 'readme.md'), {
      wrapper: wrapper(qc),
    })
    expect(result.current.fetchStatus).toBe('idle')

    const { result: result2 } = renderHook(() => useWorkspaceFile('ws-1', '', 'readme.md'), {
      wrapper: wrapper(qc),
    })
    expect(result2.current.fetchStatus).toBe('idle')

    const { result: result3 } = renderHook(() => useWorkspaceFile('ws-1', 'host-1', ''), {
      wrapper: wrapper(qc),
    })
    expect(result3.current.fetchStatus).toBe('idle')
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceFile('ws-1', 'host-1', 'missing.txt'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to load file')
  })
})

// ── useSaveWorkspaceFile ──────────────────────────────────────────────────

describe('useSaveWorkspaceFile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls PUT /api/workspaces/:workspaceId/file with hostId, path, and content', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, path: 'readme.md' }),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useSaveWorkspaceFile('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      path: 'readme.md',
      content: '# Updated',
    })

    expect(response).toEqual({ success: true, path: 'readme.md' })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/file'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ hostId: 'host-1', path: 'readme.md', content: '# Updated' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useSaveWorkspaceFile('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ path: 'readme.md', content: 'fail' }),
    ).rejects.toThrow('Failed to save file: 400')
  })

  it('invalidates the file query and folder tree on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, path: 'readme.md' }),
    } as Response)

    const qc = createQueryClient()
    // Pre-populate queries so invalidation can be observed
    qc.setQueryData(['workspace-folder-tree', 'ws-1', 'host-1'], mockFolderTree)
    qc.setQueryData(['workspace-file', 'ws-1', 'host-1', 'readme.md'], mockFileResponse)

    const { result } = renderHook(() => useSaveWorkspaceFile('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ path: 'readme.md', content: '# Updated' })

    const treeState = qc.getQueryState(['workspace-folder-tree', 'ws-1', 'host-1'])
    expect(treeState?.isInvalidated).toBe(true)

    const fileState = qc.getQueryState(['workspace-file', 'ws-1', 'host-1', 'readme.md'])
    expect(fileState?.isInvalidated).toBe(true)
  })
})
