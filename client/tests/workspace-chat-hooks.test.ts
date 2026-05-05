import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useWorkspaceChats,
  useWorkspaceChatDetail,
  useCreateWorkspaceChat,
  useSendWorkspaceMessage,
} from '#/hooks/useWorkspaceChats'
import type { WorkspaceChat, WorkspaceChatDetail, WorkspaceMessage, SendWorkspaceMessageResponse } from '#/lib/types'

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

const mockWorkspaceChat: WorkspaceChat = {
  id: 'wchat-1',
  workspaceId: 'ws-1',
  title: 'Project Discussion',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  promptCount: 2,
  totalPromptTokens: 100,
  totalCompletionTokens: 200,
  totalTokens: 300,
}

const mockWorkspaceMessage: WorkspaceMessage = {
  id: 'wmsg-1',
  workspaceChatId: 'wchat-1',
  senderType: 'user',
  senderId: null,
  content: 'Hello agents!',
  timestamp: '2026-05-01T00:00:01.000Z',
  modelUsed: '',
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  attachments: null,
}

const mockAgentMessage: WorkspaceMessage = {
  id: 'wmsg-2',
  workspaceChatId: 'wchat-1',
  senderType: 'agent',
  senderId: 'agent-1',
  content: 'Hello! How can I help?',
  timestamp: '2026-05-01T00:00:02.000Z',
  modelUsed: 'llama3',
  promptTokens: 50,
  completionTokens: 25,
  totalTokens: 75,
  attachments: null,
}

const mockChatDetail: WorkspaceChatDetail = {
  chat: mockWorkspaceChat,
  messages: [mockWorkspaceMessage, mockAgentMessage],
}

// ── useWorkspaceChats ─────────────────────────────────────────────────────

describe('useWorkspaceChats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches workspace chats from /api/workspaces/:workspaceId/chats?hostId=...', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([mockWorkspaceChat]),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceChats('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockWorkspaceChat])
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/chats?hostId=host-1'),
      expect.anything(),
    )
  })

  it('is disabled when workspaceId or hostId is empty', () => {
    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceChats('', 'host-1'), {
      wrapper: wrapper(qc),
    })

    expect(result.current.fetchStatus).toBe('idle')

    const { result: result2 } = renderHook(() => useWorkspaceChats('ws-1', ''), {
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
    const { result } = renderHook(() => useWorkspaceChats('ws-1', 'host-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to fetch workspace chats')
  })
})

// ── useWorkspaceChatDetail ────────────────────────────────────────────────

describe('useWorkspaceChatDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches chat detail from /api/workspace-chats/:chatId', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockChatDetail),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceChatDetail('wchat-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockChatDetail)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspace-chats/wchat-1'),
      expect.anything(),
    )
  })

  it('is disabled when chatId is empty', () => {
    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceChatDetail(''), {
      wrapper: wrapper(qc),
    })

    expect(result.current.fetchStatus).toBe('idle')
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useWorkspaceChatDetail('wchat-1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Failed to fetch workspace chat')
  })
})

// ── useCreateWorkspaceChat ────────────────────────────────────────────────

describe('useCreateWorkspaceChat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/workspaces/:workspaceId/chats and returns the created chat', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockWorkspaceChat),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useCreateWorkspaceChat(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      workspaceId: 'ws-1',
      hostId: 'host-1',
      title: 'Project Discussion',
    })

    expect(response).toEqual(mockWorkspaceChat)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspaces/ws-1/chats'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hostId: 'host-1', title: 'Project Discussion' }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useCreateWorkspaceChat(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ workspaceId: 'ws-1', hostId: 'host-1' }),
    ).rejects.toThrow('Failed to create workspace chat: 400')
  })

  it('invalidates workspace chats query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockWorkspaceChat),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspace-chats', 'ws-1', 'host-1'], [])

    const { result } = renderHook(() => useCreateWorkspaceChat(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({ workspaceId: 'ws-1', hostId: 'host-1' })

    const state = qc.getQueryState(['workspace-chats', 'ws-1', 'host-1'])
    expect(state?.isInvalidated).toBe(true)
  })
})

// ── useSendWorkspaceMessage ───────────────────────────────────────────────

describe('useSendWorkspaceMessage', () => {
  const mockResponse: SendWorkspaceMessageResponse = {
    responses: [
      { agentId: 'agent-1', response: 'Hello! How can I help?' },
    ],
    workspaceChatId: 'wchat-1',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls POST /api/workspace-chats/:chatId/messages and returns the responses', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useSendWorkspaceMessage(), {
      wrapper: wrapper(qc),
    })

    const response = await result.current.mutateAsync({
      chatId: 'wchat-1',
      prompt: 'Hello agents!',
      agentIds: ['agent-1'],
    })

    expect(response).toEqual(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/workspace-chats/wchat-1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'Hello agents!', agentIds: ['agent-1'] }),
      }),
    )
  })

  it('throws when the server responds with an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    const qc = createQueryClient()
    const { result } = renderHook(() => useSendWorkspaceMessage(), {
      wrapper: wrapper(qc),
    })

    await expect(
      result.current.mutateAsync({ chatId: 'wchat-1', prompt: 'Hi', agentIds: ['agent-1'] }),
    ).rejects.toThrow('Failed to send workspace message: 502')
  })

  it('invalidates workspace chat detail query on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const qc = createQueryClient()
    qc.setQueryData(['workspace-chat-detail', 'wchat-1'], mockChatDetail)

    const { result } = renderHook(() => useSendWorkspaceMessage(), {
      wrapper: wrapper(qc),
    })

    await result.current.mutateAsync({
      chatId: 'wchat-1',
      prompt: 'Hello agents!',
      agentIds: ['agent-1'],
    })

    const state = qc.getQueryState(['workspace-chat-detail', 'wchat-1'])
    expect(state?.isInvalidated).toBe(true)
  })
})
