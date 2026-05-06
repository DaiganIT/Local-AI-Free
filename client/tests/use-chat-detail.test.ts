import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useChatDetail } from '#/hooks/useChatDetail'
import type { Message } from '#/lib/types'

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

const mockChatResponse = {
  chat: {
    id: 'chat-1',
    agentId: 'agent-1',
    title: 'Test chat',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
  messages: [
    {
      id: 'msg-1',
      chatId: 'chat-1',
      role: 'user',
      content: 'Think deep!',
      createdAt: '2026-05-01T00:00:01.000Z',
      thinkingContent: null,
    },
    {
      id: 'msg-2',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here is my answer',
      createdAt: '2026-05-01T00:00:02.000Z',
      thinkingContent: 'I am thinking about this carefully...',
    },
  ],
  totalIn: 100,
  totalOut: 200,
}

describe('useChatDetail', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('maps thinkingContent from API response to thinking field on Message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockChatResponse,
    } as Response)

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useChatDetail('chat-1'), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const messages = result.current.data!.messages
    const assistantMsg = messages.find((m: Message) => m.role === 'assistant')
    expect(assistantMsg?.thinking).toBe('I am thinking about this carefully...')
  })

  it('maps null thinkingContent to null thinking on Message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockChatResponse,
    } as Response)

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useChatDetail('chat-1'), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const messages = result.current.data!.messages
    const userMsg = messages.find((m: Message) => m.role === 'user')
    expect(userMsg?.thinking).toBeNull()
  })

  it('maps agentId from chat to each message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockChatResponse,
    } as Response)

    const queryClient = createQueryClient()
    const { result } = renderHook(() => useChatDetail('chat-1'), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const messages = result.current.data!.messages
    expect(messages.every((m: Message) => m.agentId === 'agent-1')).toBe(true)
  })
})
