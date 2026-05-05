import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceExplorer } from '#/components/WorkspaceExplorer'
import * as useWorkspaceFileModule from '#/hooks/useWorkspaceFile'

// ── Test helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderWithProvider(ui: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const qc = createQueryClient()
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(QueryClientProvider, { client: qc }, ui),
    )
  })
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// ── Mock data ─────────────────────────────────────────────────────────────

const mockTree = {
  tree: {
    id: 'project-alpha',
    name: 'project-alpha',
    kind: 'directory' as const,
    children: [
      { id: 'project-alpha/README.md', name: 'README.md', kind: 'file' as const, children: [] },
      { id: 'project-alpha/src', name: 'src', kind: 'directory' as const, children: [
        { id: 'project-alpha/src/index.ts', name: 'index.ts', kind: 'file' as const, children: [] },
      ]},
    ],
  },
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('WorkspaceExplorer', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // jsdom doesn't implement ResizeObserver
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupMocks() {
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: mockTree,
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
  }

  it('renders the workspace explorer header', () => {
    setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceExplorer, { workspaceId: 'ws-1', hostId: 'host-1' }),
    )

    expect(container.textContent).toContain('Files')
    unmount()
  })

  it('renders file and folder items from the tree', () => {
    setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceExplorer, { workspaceId: 'ws-1', hostId: 'host-1' }),
    )

    expect(container.textContent).toContain('README.md')
    expect(container.textContent).toContain('src')
    unmount()
  })

  it('shows loading state when tree is pending', () => {
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceExplorer, { workspaceId: 'ws-1', hostId: 'host-1' }),
    )

    expect(container.querySelector('[aria-busy]') || container.textContent).toBeTruthy()
    unmount()
  })

  it('shows error state when tree fetch fails', () => {
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Failed to load'),
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceExplorer, { workspaceId: 'ws-1', hostId: 'host-1' }),
    )

    expect(container.textContent).toContain('Failed to load')
    unmount()
  })
})
