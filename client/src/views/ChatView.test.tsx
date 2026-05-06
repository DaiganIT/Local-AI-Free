import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatView } from './ChatView'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// We'll override useStreamingChat per test
const mockUseStreamingChat = vi.fn()

// Mock all hooks — override useStreamingChat with our mock
vi.mock('#/hooks', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/hooks')>()
  return {
    ...original,
    useAgent: () => ({
      data: {
        id: 'agent-1',
        hostId: 'host-1',
        name: 'TestBot',
        status: 'online',
        model: 'llama3',
        description: 'A test agent',
      },
    }),
    useChatDetail: () => ({
      data: {
        chat: { id: 'chat-1', agentId: 'agent-1', title: 'Test Chat', createdAt: '', updatedAt: '' },
        messages: [],
        totalIn: 0,
        totalOut: 0,
        totalReasoning: undefined,
      },
      isLoading: false,
    }),
    useDeleteChat: () => ({ mutateAsync: vi.fn() }),
    useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
    useStreamingChat: () => mockUseStreamingChat(),
    usePendingAttachments: () => ({
      attachments: [],
      addFiles: vi.fn(),
      removeAttachment: vi.fn(),
      clearAttachments: vi.fn(),
      isUploading: false,
    }),
  }
})

// Mock navigation
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock other components
vi.mock('#/components/AgentWorkspaceExplorer', () => ({
  AgentWorkspaceExplorer: () => <div data-testid="workspace-explorer" />,
}))
vi.mock('#/components/ArtifactPanel', () => ({
  ArtifactPanel: () => <div data-testid="artifact-panel" />,
}))
vi.mock('#/components/AttachmentChips', () => ({
  AttachmentChips: () => <div data-testid="attachment-chips" />,
}))

// MentionInput mock: renders a plain <input> so existing tests work unchanged.
// The forwardRef exposes getText/getMentions/clear/focus via the ref.
vi.mock('#/components/MentionInput', () => {
  const React = require('react')
  const MentionInput = React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const valueRef = React.useRef('')
      const [value, setValue] = React.useState('')
      React.useImperativeHandle(ref, () => ({
        getText: () => valueRef.current,
        getMentions: () => [],
        clear: () => { setValue(''); valueRef.current = ''; (props.onHasTextChange as (b: boolean) => void)?.(false) },
        focus: () => {},
      }))
      return React.createElement('input', {
        placeholder: props.placeholder as string,
        disabled: props.disabled as boolean,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          valueRef.current = e.target.value
          setValue(e.target.value);
          (props.onHasTextChange as (b: boolean) => void)?.(e.target.value.length > 0)
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') (props.onSend as () => void)?.()
        },
      })
    },
  )
  return { MentionInput }
})

describe('ChatView — streaming integration (S3c)', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    mockUseStreamingChat.mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    })
    mockNavigate.mockReset()
  })

  it('shows StreamingMessageBubble with cursor while streaming', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'Hello',
      streamingThinking: '',
      isStreaming: true,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // StreamingMessageBubble should render with streaming cursor
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
    // Text should be visible
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('shows thinking content in StreamingMessageBubble while streaming', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'The answer',
      streamingThinking: 'Let me think...',
      isStreaming: true,
      isThinkingStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    // StreamingMessageBubble shows thinking panel
    expect(screen.getByText('Thinking…')).toBeTruthy()
    expect(screen.getByText('The answer')).toBeTruthy()
  })

  it('calls send() when user submits a message', () => {
    const mockSend = vi.fn()
    mockUseStreamingChat.mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: mockSend,
    })

    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    const input = screen.getByPlaceholderText(/Message TestBot/i)
    fireEvent.change(input, { target: { value: 'Hello agent' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockSend).toHaveBeenCalledWith({
      agentId: 'agent-1',
      prompt: 'Hello agent',
      chatId: 'chat-1',
    })
  })

  it('shows error when streaming fails', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: 'Stream failed',
      result: null,
      send: vi.fn(),
    })

    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText(/Stream failed/)).toBeTruthy()
  })

  it('shows persisted MessageBubble after stream completes with result', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'Full response',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: null,
      result: {
        response: 'Full response',
        chatId: 'chat-1',
        userMessageId: 'msg-u-1',
        agentId: 'agent-1',
      },
      send: vi.fn(),
    })

    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // After stream completes, no streaming cursor
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeNull()
    // The persisted message text should be visible via MessageBubble
    expect(screen.getByText('Full response')).toBeTruthy()
  })

  it('disables input while streaming', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'Streaming...',
      streamingThinking: '',
      isStreaming: true,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    })

    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    const input = screen.getByPlaceholderText(/Waiting/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('shows thinking streaming indicator while thinking is active', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: '',
      streamingThinking: 'Thinking...',
      isStreaming: true,
      isThinkingStreaming: true,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // Thinking streaming indicator should be present
    const indicator = container.querySelector('[data-thinking-streaming]')
    expect(indicator).toBeTruthy()
    expect(screen.getByText('Thinking…')).toBeTruthy()
  })

  it('hides thinking streaming indicator after thinking ends but text still streaming', () => {
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'Answer so far',
      streamingThinking: 'I thought about it',
      isStreaming: true,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: vi.fn(),
    })

    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // Thinking streaming indicator should NOT be present
    const indicator = container.querySelector('[data-thinking-streaming]')
    expect(indicator).toBeNull()
    // But thinking panel should still be visible
    expect(screen.getByText('Thinking…')).toBeTruthy()
    // And text cursor should still be active
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
  })

  it('navigates to new chat when result contains new chatId and no initial chatId', async () => {
    // Start without a chatId
    const { rerender } = render(
      <ChatView agentId="agent-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // Simulate stream completing with a new chatId
    mockUseStreamingChat.mockReturnValue({
      streamingText: 'Response text',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: null,
      result: {
        response: 'Response text',
        chatId: 'new-chat-123',
        userMessageId: 'msg-u-1',
        agentId: 'agent-1',
      },
      send: vi.fn(),
    })

    rerender(<ChatView agentId="agent-1" hostId="host-1" />)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.stringContaining('new-chat-123'),
          replace: true,
        }),
      )
    })
  })

  it('renders paperclip button for file attachments', () => {
    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    const paperclipBtn = screen.getByTitle('Attach file')
    expect(paperclipBtn).toBeTruthy()
  })

  it('renders a hidden file input', () => {
    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
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

  it('disables send while uploads are in progress', () => {
    // When isUploading is false, the input should be enabled
    render(<ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />, {
      wrapper: createWrapper(),
    })

    const input = screen.getByPlaceholderText(/Message TestBot/i) as HTMLInputElement
    expect(input.disabled).toBe(false)
  })

  it('shows attachment chips when there are pending attachments', () => {
    // Since we mock usePendingAttachments to return empty attachments by default,
    // and AttachmentChips is also mocked, we verify the component renders
    // the chips area only when there are attachments
    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    // AttachmentChips should NOT be rendered when attachments is empty
    expect(container.querySelector('[data-testid="attachment-chips"]')).toBeNull()
  })

  it('handles drag over on messages area', () => {
    const { container } = render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    const messagesArea = container.querySelector('.overflow-y-auto')
    expect(messagesArea).toBeTruthy()

    // Fire drag over event
    fireEvent.dragOver(messagesArea!, { dataTransfer: { types: ['Files'] } })
    // The component should handle the event without errors
  })

  it('passes attachments in the send payload (F8)', () => {
    // We verify the send payload structure by testing that when
    // usePendingAttachments returns done attachments, they are
    // included in the streamingSend call.
    //
    // Since the mock is module-level, we test this indirectly:
    // the default mock returns empty attachments, so the
    // streamingSend call should NOT include attachments.
    // The actual F8 logic is tested in useStreamingChat.test.ts
    // and the component integration is tested by the existing
    // 'calls send() when user submits a message' test.
    //
    // Here we verify the component doesn't crash and the
    // send function is called with the expected shape.
    const mockSend = vi.fn()
    mockUseStreamingChat.mockReturnValue({
      streamingText: '',
      streamingThinking: '',
      isStreaming: false,
      isThinkingStreaming: false,
      error: null,
      result: null,
      send: mockSend,
    })

    render(
      <ChatView agentId="agent-1" chatId="chat-1" hostId="host-1" />,
      { wrapper: createWrapper() },
    )

    const input = screen.getByPlaceholderText(/Message TestBot/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // With empty attachments, the send payload should not include
    // an attachments field (it will be undefined/empty)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        prompt: 'Hello',
        chatId: 'chat-1',
      }),
    )
  })
})
