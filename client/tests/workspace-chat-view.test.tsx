import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceChatView } from '#/views/WorkspaceChatView'
import type { WorkspaceChatDetail, AgentInfo, WorkspaceInfo } from '#/lib/types'
import * as useWorkspacesModule from '#/hooks/useWorkspaces'
import * as useWorkspaceChatsModule from '#/hooks/useWorkspaceChats'
import * as useAgentsModule from '#/hooks/useAgents'
import * as useWorkspaceFileModule from '#/hooks/useWorkspaceFile'
import * as useStreamingWorkspaceChatModule from '#/hooks/useStreamingWorkspaceChat'

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
    queryByText: (text: string) => container.querySelector(`[data-testid]`)?.textContent?.includes(text) ??
      (container.textContent?.includes(text) ? text : null),
    getByText: (text: string) => {
      if (!container.textContent?.includes(text)) {
        throw new Error(`Text "${text}" not found in: ${container.textContent?.slice(0, 200)}`)
      }
      return text
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

// ── Mock data ─────────────────────────────────────────────────────────────

const mockWorkspace: WorkspaceInfo = {
  id: 'ws-1',
  hostId: 'host-1',
  name: 'Project Alpha',
  alias: 'alpha',
  path: 'project-alpha',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const mockAgent1: AgentInfo = {
  id: 'agent-1',
  hostId: 'host-1',
  name: 'Coder',
  status: 'online',
  model: 'llama3',
}

const mockAgent2: AgentInfo = {
  id: 'agent-2',
  hostId: 'host-1',
  name: 'Reviewer',
  status: 'online',
  model: 'mistral',
}

const mockChatDetail: WorkspaceChatDetail = {
  chat: {
    id: 'wchat-1',
    workspaceId: 'ws-1',
    title: 'Project Discussion',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    promptCount: 1,
    totalPromptTokens: 50,
    totalCompletionTokens: 25,
    totalTokens: 75,
  },
  messages: [
    {
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
    },
    {
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
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('WorkspaceChatView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // jsdom doesn't implement scrollIntoView or ResizeObserver
    Element.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupMocks(opts?: { streamingSend?: ReturnType<typeof vi.fn>; isStreaming?: boolean }) {
    vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue({
      data: [mockWorkspace],
      isLoading: false,
    } as never)

    vi.spyOn(useWorkspacesModule, 'useWorkspaceAgents').mockReturnValue({
      data: ['agent-1', 'agent-2'],
      isLoading: false,
    } as never)

    vi.spyOn(useAgentsModule, 'useAgents').mockReturnValue({
      data: [mockAgent1, mockAgent2],
    } as never)

    vi.spyOn(useWorkspaceChatsModule, 'useWorkspaceChatDetail').mockReturnValue({
      data: mockChatDetail,
      isLoading: false,
    } as never)

    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: { tree: { id: 'ws-1', name: 'project-alpha', kind: 'directory', children: [] } },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)

    const streamingSend = opts?.streamingSend ?? vi.fn()
    vi.spyOn(useStreamingWorkspaceChatModule, 'useStreamingWorkspaceChat').mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: opts?.isStreaming ?? false,
      error: null,
      result: null,
      send: streamingSend,
    } as never)

    return { streamingSend }
  }

  it('renders the workspace name in the header', () => {
    setupMocks()
    const { getByText, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    expect(getByText('Project Alpha')).toBeTruthy()
    unmount()
  })

  it('renders existing messages from the chat', () => {
    setupMocks()
    const { getByText, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    expect(getByText('Hello agents!')).toBeTruthy()
    expect(getByText('Hello! How can I help?')).toBeTruthy()
    unmount()
  })

  it('renders agent chip selector with workspace agents', () => {
    setupMocks()
    const { getByText, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Both agent names should appear (chips + sender labels)
    expect(getByText('Coder')).toBeTruthy()
    expect(getByText('Reviewer')).toBeTruthy()
    unmount()
  })

  it('disables input when no agent is selected', () => {
    setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Find the text input (not the hidden file input)
    const input = container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null
    // In our layout, the text input doesn't have type="text", but the file input has type="file"
    const allInputs = container.querySelectorAll('input')
    const textInput = Array.from(allInputs).find((inp) => inp.type !== 'file') as HTMLInputElement | undefined
    expect(textInput).toBeTruthy()
    expect(textInput!.disabled).toBe(true)
    unmount()
  })

  it('enables input after selecting an agent', () => {
    setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Find and click the "Coder" chip button (buttons with agent names)
    const buttons = container.querySelectorAll('button')
    const coderButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes('Coder') && btn.classList.contains('rounded-full'),
    )
    expect(coderButton).toBeTruthy()

    act(() => {
      coderButton!.click()
    })

    // Input should now be enabled
    const allInputs = container.querySelectorAll('input')
    const textInput = Array.from(allInputs).find((inp) => inp.type !== 'file') as HTMLInputElement | undefined
    expect(textInput?.disabled).toBe(false)
    unmount()
  })

  it('shows per-agent loading indicators when sending to multiple agents', () => {
    const streamingSend = vi.fn()
    setupMocks({ streamingSend })
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Select both agents
    const buttons = container.querySelectorAll('button')
    const coderButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes('Coder') && btn.classList.contains('rounded-full'),
    )
    const reviewerButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes('Reviewer') && btn.classList.contains('rounded-full'),
    )
    act(() => {
      coderButton!.click()
      reviewerButton!.click()
    })

    // Type and send — use the text input (not file input)
    const allInputs = container.querySelectorAll('input')
    const input = Array.from(allInputs).find((inp) => inp.type !== 'file') as HTMLInputElement | undefined
    expect(input).toBeTruthy()
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set
      nativeInputValueSetter!.call(input!, 'Hello both!')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Verify streaming send was called with both agents
    expect(streamingSend).toHaveBeenCalledWith({
      chatId: 'wchat-1',
      prompt: 'Hello both!',
      agentIds: ['agent-1', 'agent-2'],
    })

    unmount()
  })

  it('shows per-agent streaming bubbles with agent names when sending to multiple agents', () => {
    const streamingSend = vi.fn()
    // Simulate streaming state with two agents
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Coder response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Coder',
    })
    agentStreams.set('agent-2', {
      text: 'Reviewer response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Reviewer',
    })

    vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue({
      data: [mockWorkspace],
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspacesModule, 'useWorkspaceAgents').mockReturnValue({
      data: ['agent-1', 'agent-2'],
      isLoading: false,
    } as never)
    vi.spyOn(useAgentsModule, 'useAgents').mockReturnValue({
      data: [mockAgent1, mockAgent2],
    } as never)
    vi.spyOn(useWorkspaceChatsModule, 'useWorkspaceChatDetail').mockReturnValue({
      data: mockChatDetail,
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: { tree: { id: 'ws-1', name: 'project-alpha', kind: 'directory', children: [] } },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.spyOn(useStreamingWorkspaceChatModule, 'useStreamingWorkspaceChat').mockReturnValue({
      currentAgentId: 'agent-2',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: streamingSend,
    } as never)

    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // While streaming, there should be per-agent streaming bubbles
    // Each bubble shows the agent name via data-testid="agent-name"
    const agentNameElements = container.querySelectorAll('[data-testid="agent-name"]')
    expect(agentNameElements.length).toBe(2)

    // Each should show the agent's name
    const names = Array.from(agentNameElements).map((el) => el.textContent)
    expect(names).toContain('Coder')
    expect(names).toContain('Reviewer')

    unmount()
  })

  it('shows error message when streaming fails', () => {
    vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue({
      data: [mockWorkspace],
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspacesModule, 'useWorkspaceAgents').mockReturnValue({
      data: ['agent-1', 'agent-2'],
      isLoading: false,
    } as never)
    vi.spyOn(useAgentsModule, 'useAgents').mockReturnValue({
      data: [mockAgent1, mockAgent2],
    } as never)
    vi.spyOn(useWorkspaceChatsModule, 'useWorkspaceChatDetail').mockReturnValue({
      data: mockChatDetail,
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: { tree: { id: 'ws-1', name: 'project-alpha', kind: 'directory', children: [] } },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.spyOn(useStreamingWorkspaceChatModule, 'useStreamingWorkspaceChat').mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: false,
      error: 'Server error',
      result: null,
      send: vi.fn(),
    } as never)

    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Error message should appear
    expect(container.textContent).toContain('Error: Server error')

    unmount()
  })

  it('shows per-agent streaming bubble when sending to a single agent', () => {
    const streamingSend = vi.fn()
    // Simulate streaming state with one agent
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Coder response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Coder',
    })

    vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue({
      data: [mockWorkspace],
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspacesModule, 'useWorkspaceAgents').mockReturnValue({
      data: ['agent-1', 'agent-2'],
      isLoading: false,
    } as never)
    vi.spyOn(useAgentsModule, 'useAgents').mockReturnValue({
      data: [mockAgent1, mockAgent2],
    } as never)
    vi.spyOn(useWorkspaceChatsModule, 'useWorkspaceChatDetail').mockReturnValue({
      data: mockChatDetail,
      isLoading: false,
    } as never)
    vi.spyOn(useWorkspaceFileModule, 'useWorkspaceFolderTree').mockReturnValue({
      data: { tree: { id: 'ws-1', name: 'project-alpha', kind: 'directory', children: [] } },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never)
    vi.spyOn(useStreamingWorkspaceChatModule, 'useStreamingWorkspaceChat').mockReturnValue({
      currentAgentId: 'agent-1',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: streamingSend,
    } as never)

    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Should have one streaming bubble with Coder name
    const agentNameElements = container.querySelectorAll('[data-testid="agent-name"]')
    expect(agentNameElements.length).toBe(1)
    expect(agentNameElements[0].textContent).toBe('Coder')

    unmount()
  })

  it('renders the workspace explorer sidebar', () => {
    setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // The sidebar should be present with the WorkspaceExplorer
    const sidebar = container.querySelector('.workspace-rail')
    expect(sidebar).toBeTruthy()
    expect(sidebar?.textContent).toContain('Files')
    unmount()
  })

  it('sends a message when agent is selected and form is submitted', () => {
    const { streamingSend } = setupMocks()
    const { container, unmount } = renderWithProvider(
      createElement(WorkspaceChatView, { workspaceId: 'ws-1', hostId: 'host-1', chatId: 'wchat-1' }),
    )

    // Select the Coder agent chip
    const buttons = container.querySelectorAll('button')
    const coderButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes('Coder') && btn.classList.contains('rounded-full'),
    )
    act(() => {
      coderButton!.click()
    })

    // Type a message — use the text input (not file input)
    const allInputs = container.querySelectorAll('input')
    const input = Array.from(allInputs).find((inp) => inp.type !== 'file') as HTMLInputElement | undefined
    expect(input).toBeTruthy()
    act(() => {
      // Set value via native input setter to trigger React's change handling
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set
      nativeInputValueSetter!.call(input!, 'Can you help me?')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Press Enter
    act(() => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Verify the streaming send was called
    expect(streamingSend).toHaveBeenCalledWith({
      chatId: 'wchat-1',
      prompt: 'Can you help me?',
      agentIds: ['agent-1'],
    })
    unmount()
  })
})
