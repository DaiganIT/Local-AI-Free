import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceChatView } from './WorkspaceChatView'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// We'll override useStreamingWorkspaceChat per test
const mockUseStreamingWorkspaceChat = vi.fn()

// Mock all hooks — override useStreamingWorkspaceChat with our mock
vi.mock('#/hooks', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/hooks')>()
  return {
    ...original,
    useWorkspaces: () => ({
      data: [
        {
          id: 'ws-1',
          hostId: 'host-1',
          name: 'Test Workspace',
          alias: 'test',
          path: '/tmp/test',
          createdAt: '',
          updatedAt: '',
        },
      ],
      isLoading: false,
    }),
    useWorkspaceAgents: () => ({
      data: ['agent-1', 'agent-2'],
      isLoading: false,
    }),
    useAgents: () => ({
      data: [
        { id: 'agent-1', hostId: 'host-1', name: 'Writer', status: 'online', model: 'llama3' },
        { id: 'agent-2', hostId: 'host-1', name: 'Reviewer', status: 'online', model: 'llama3' },
      ],
    }),
    useWorkspaceChatDetail: () => ({
      data: {
        chat: { id: 'chat-1', workspaceId: 'ws-1', title: 'Test Chat', createdAt: '', updatedAt: '', promptCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 },
        messages: [],
      },
      isLoading: false,
    }),
    useSendWorkspaceMessage: () => ({ mutate: vi.fn(), isPending: false }),
    useStreamingWorkspaceChat: () => mockUseStreamingWorkspaceChat(),
    usePendingAttachments: () => ({
      attachments: [],
      addFiles: vi.fn(),
      removeAttachment: vi.fn(),
      clearAttachments: vi.fn(),
      isUploading: false,
    }),
  }
})

// Mock components
vi.mock('#/components/WorkspaceExplorer', () => ({
  WorkspaceExplorer: () => <div data-testid="workspace-explorer" />,
}))
vi.mock('#/components/ArtifactPanel', () => ({
  ArtifactPanel: () => <div data-testid="artifact-panel" />,
}))
vi.mock('#/components/AttachmentChips', () => ({
  AttachmentChips: () => <div data-testid="attachment-chips" />,
}))

describe('WorkspaceChatView — streaming integration (S5d)', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    })
  })

  it('shows StreamingMessageBubble with correct agent label while streaming', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Hello from Writer',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Writer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: 'agent-1',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // Agent label in streaming bubble should show (data-testid="agent-name")
    const agentLabel = screen.getByTestId('agent-name')
    expect(agentLabel.textContent).toBe('Writer')
    // Streaming text should show
    expect(screen.getByText('Hello from Writer')).toBeTruthy()
    // Agent initial should be in the avatar
    expect(screen.getByTestId('agent-initial').textContent).toBe('W')
  })

  it('shows streaming cursor during active streaming', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Streaming...',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Writer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: 'agent-1',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
  })

  it('renders thinking blocks per agent during streaming', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Answer',
      thinking: 'Let me think...',
      isThinkingStreaming: true,
      isComplete: false,
      agentName: 'Writer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: 'agent-1',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // Thinking block should be present
    expect(screen.getByText('Thoughts')).toBeTruthy()
    // Thinking streaming indicator should be present
    const indicator = container.querySelector('[data-thinking-streaming]')
    expect(indicator).toBeTruthy()
    // Agent label in streaming bubble should still show
    expect(screen.getByTestId('agent-name').textContent).toBe('Writer')
  })

  it('renders multiple agents streaming sequentially', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'First response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Writer',
    })
    agentStreams.set('agent-2', {
      text: 'Second response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Reviewer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: 'agent-2',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // Both agent labels in streaming bubbles should be visible
    const agentNames = screen.getAllByTestId('agent-name')
    expect(agentNames.length).toBe(2)
    expect(agentNames[0].textContent).toBe('Writer')
    expect(agentNames[1].textContent).toBe('Reviewer')
    // Both texts should be visible
    expect(screen.getByText('First response')).toBeTruthy()
    expect(screen.getByText('Second response')).toBeTruthy()
    // Only the current streaming agent should have a cursor
    const cursors = container.querySelectorAll('[data-streaming-cursor]')
    expect(cursors.length).toBe(1)
  })

  it('disables input while streaming', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Streaming...',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: false,
      agentName: 'Writer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: 'agent-1',
      agentStreams,
      isStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    const input = screen.getByPlaceholderText(/Waiting/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('shows persisted messages after stream completes', async () => {
    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: false,
      error: null,
      result: {
        responses: [
          { agentId: 'agent-1', response: 'Final answer from Writer' },
          { agentId: 'agent-2', response: 'Final review from Reviewer' },
        ],
        workspaceChatId: 'chat-1',
      },
      send: vi.fn(),
    })

    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // After stream completes, the local messages should include the responses
    await waitFor(() => {
      expect(screen.getByText('Final answer from Writer')).toBeTruthy()
    })
    expect(screen.getByText('Final review from Reviewer')).toBeTruthy()
  })

  it('shows error when streaming fails', () => {
    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: false,
      error: 'Agent not found',
      result: null,
      send: vi.fn(),
    })

    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText(/Agent not found/)).toBeTruthy()
  })

  it('calls send() with correct params when user submits a message', () => {
    const mockSend = vi.fn()
    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: null,
      agentStreams: new Map(),
      isStreaming: false,
      error: null,
      result: null,
      send: mockSend,
    })

    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // Select an agent first
    const writerChip = screen.getByText('Writer')
    fireEvent.click(writerChip)

    // Type and send
    const input = screen.getByPlaceholderText(/Message/i)
    fireEvent.change(input, { target: { value: 'Hello agents' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockSend).toHaveBeenCalledWith({
      chatId: 'chat-1',
      prompt: 'Hello agents',
      agentIds: ['agent-1'],
    })
  })

  it('hides streaming cursor after stream completes', () => {
    const agentStreams = new Map()
    agentStreams.set('agent-1', {
      text: 'Complete response',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Writer',
    })

    mockUseStreamingWorkspaceChat.mockReturnValue({
      currentAgentId: null,
      agentStreams,
      isStreaming: false,
      error: null,
      result: {
        responses: [{ agentId: 'agent-1', response: 'Complete response' }],
        workspaceChatId: 'chat-1',
      },
      send: vi.fn(),
    })

    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    // No streaming cursor after completion
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeNull()
  })

  it('renders paperclip button for file attachments', () => {
    render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    const paperclipBtn = screen.getByTitle('Attach file')
    expect(paperclipBtn).toBeTruthy()
  })

  it('renders a hidden file input with multiple attribute', () => {
    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.multiple).toBe(true)
    // U5: File picker should accept images, PDFs, DOCX, and common text/code types
    expect(fileInput.accept).toContain('image/*')
    expect(fileInput.accept).toContain('.pdf')
    expect(fileInput.accept).toContain('.docx')
  })

  it('handles drag over on messages area without errors', () => {
    const { container } = render(
      <WorkspaceChatView workspaceId="ws-1" hostId="host-1" chatId="chat-1" />,
      { wrapper: createWrapper() },
    )

    const messagesArea = container.querySelector('.overflow-y-auto')
    expect(messagesArea).toBeTruthy()
    fireEvent.dragOver(messagesArea!, { dataTransfer: { types: ['Files'] } })
  })
})
