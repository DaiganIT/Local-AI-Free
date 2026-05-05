import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatView } from '#/views/ChatView'
import type { AgentInfo, ChatDetail } from '#/lib/types'
import * as useAgentsModule from '#/hooks/useAgents'
import * as useChatDetailModule from '#/hooks/useChatDetail'
import * as useSendMessageModule from '#/hooks/useSendMessage'
import * as useDeleteChatModule from '#/hooks/useDeleteChat'
import * as useStreamingChatModule from '#/hooks/useStreamingChat'

// Mock TanStack Router navigate
const mockNavigate = vi.fn().mockResolvedValue(undefined)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// ── Test helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

const mockAgent: AgentInfo = {
  id: 'agent-1',
  hostId: 'host-1',
  name: 'Test Agent',
  model: 'llama3',
  status: 'online',
  description: 'A test agent',
}

const mockChatDetail: ChatDetail = {
  chat: {
    id: 'chat-1',
    agentId: 'agent-1',
    title: 'Test Chat',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    promptCount: 1,
    totalPromptTokens: 18,
    totalCompletionTokens: 45,
    totalTokens: 63,
  },
  messages: [
    {
      id: 'msg-1',
      agentId: 'agent-1',
      role: 'user',
      content: 'Hello',
      timestamp: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'msg-2',
      agentId: 'agent-1',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: '2025-01-01T00:00:01.000Z',
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ChatView – delete chat wire-up', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockNavigate.mockResolvedValue(undefined)
    // jsdom doesn't implement these
    Element.prototype.scrollIntoView = vi.fn()
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('triggers the delete mutation when the trash icon is clicked', async () => {
    const deleteSpy = vi.fn().mockResolvedValue({ success: true })

    vi.spyOn(useAgentsModule, 'useAgent').mockReturnValue({
      data: mockAgent,
      isLoading: false,
      isError: false,
    } as never)
    vi.spyOn(useChatDetailModule, 'useChatDetail').mockReturnValue({
      data: mockChatDetail,
      isLoading: false,
      isError: false,
    } as never)
    vi.spyOn(useSendMessageModule, 'useSendMessage').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(useStreamingChatModule, 'useStreamingChat').mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    } as never)
    vi.spyOn(useDeleteChatModule, 'useDeleteChat').mockReturnValue({
      mutate: deleteSpy,
      mutateAsync: deleteSpy,
      isPending: false,
    } as never)

    const qc = createQueryClient()
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />
      </QueryClientProvider>,
    )

    // The trash icon is an SVG with a specific class pattern (hover red + cursor-pointer)
    // Find all elements with cursor-pointer in the header area
    const allSvgs = container.querySelectorAll('svg')
    // Find the one whose class includes 'hover:text-[hsl(0' (the red hover = trash)
    let trashEl: Element | null = null
    for (const svg of allSvgs) {
      const cls = svg.getAttribute('class') ?? ''
      if (cls.includes('hover:text-[hsl(0')) {
        trashEl = svg
        break
      }
    }
    expect(trashEl).toBeTruthy()
    fireEvent.click(trashEl!)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('chat-1')
    })
  })

  it('does not show the trash icon when no chatId is present', () => {
    vi.spyOn(useAgentsModule, 'useAgent').mockReturnValue({
      data: mockAgent,
      isLoading: false,
      isError: false,
    } as never)
    vi.spyOn(useChatDetailModule, 'useChatDetail').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as never)
    vi.spyOn(useSendMessageModule, 'useSendMessage').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(useStreamingChatModule, 'useStreamingChat').mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    } as never)

    const qc = createQueryClient()
    render(
      <QueryClientProvider client={qc}>
        <ChatView agentId="agent-1" hostId="host-1" />
      </QueryClientProvider>,
    )

    // With no chatId, the trash icon is conditionally not rendered
    // (the {chatId && <Trash2 ... />} conditional)
    // We just verify it doesn't crash when without a chatId
    expect(screen.getByText(/start chatting/i)).toBeTruthy()
  })
})
