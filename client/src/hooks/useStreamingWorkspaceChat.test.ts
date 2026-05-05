import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStreamingWorkspaceChat } from './useStreamingWorkspaceChat'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'

/** Build a ReadableStream that emits SSE-formatted chunks. */
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

/** Helper: build a single SSE event string. */
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

describe('useStreamingWorkspaceChat', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('tracks a single agent streaming from start to end', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('text_delta', { delta: 'Hello', agentId: 'a1' }),
      sse('text_delta', { delta: ' world', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', { responses: [{ agentId: 'a1', response: 'Hello world' }], workspaceChatId: 'wc1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Agent a1 stream should have accumulated text
    expect(result.current.agentStreams.get('a1')).toEqual({
      text: 'Hello world',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Writer',
    })

    // Result should be set
    expect(result.current.result).toEqual({
      responses: [{ agentId: 'a1', response: 'Hello world' }],
      workspaceChatId: 'wc1',
    })
  })

  it('tracks multiple agents streaming sequentially', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('text_delta', { delta: 'Draft', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('workspace_agent_start', { agentId: 'a2', agentName: 'Reviewer' }),
      sse('text_delta', { delta: 'Review', agentId: 'a2' }),
      sse('workspace_agent_end', { agentId: 'a2' }),
      sse('done', {
        responses: [
          { agentId: 'a1', response: 'Draft' },
          { agentId: 'a2', response: 'Review' },
        ],
        workspaceChatId: 'wc1',
      }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1', 'a2'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // All agents should be tracked
    expect(result.current.agentStreams.get('a1')).toEqual({
      text: 'Draft',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Writer',
    })
    expect(result.current.agentStreams.get('a2')).toEqual({
      text: 'Review',
      thinking: '',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Reviewer',
    })
  })

  it('handles thinking events per agent', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Thinker' }),
      sse('thinking_start', { agentId: 'a1' }),
      sse('thinking_delta', { delta: 'Hmm...', agentId: 'a1' }),
      sse('thinking_end', { agentId: 'a1' }),
      sse('text_delta', { delta: 'Answer', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', {
        responses: [{ agentId: 'a1', response: 'Answer' }],
        workspaceChatId: 'wc1',
      }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(result.current.agentStreams.get('a1')).toEqual({
      text: 'Answer',
      thinking: 'Hmm...',
      isThinkingStreaming: false,
      isComplete: true,
      agentName: 'Thinker',
    })
  })

  it('handles error SSE event', async () => {
    const body = sseStream([
      sse('error', { error: 'agent not found' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.error).toBe('agent not found')
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles HTTP error (non-200)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 502,
      body: null,
      json: async () => ({ error: 'no hosts connected' }),
    } as unknown as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles network error (fetch rejects)', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Network error')
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('resets all state on each new send', async () => {
    // First call
    const body1 = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('text_delta', { delta: 'First', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', { responses: [{ agentId: 'a1', response: 'First' }], workspaceChatId: 'wc1' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body1,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual({ responses: [{ agentId: 'a1', response: 'First' }], workspaceChatId: 'wc1' })
    })

    // Second call — state should reset
    const body2 = sseStream([
      sse('workspace_agent_start', { agentId: 'a2', agentName: 'Reviewer' }),
      sse('text_delta', { delta: 'Second', agentId: 'a2' }),
      sse('workspace_agent_end', { agentId: 'a2' }),
      sse('done', { responses: [{ agentId: 'a2', response: 'Second' }], workspaceChatId: 'wc2' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body2,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    await act(async () => {
      result.current.send({ chatId: 'wc2', prompt: 'again', agentIds: ['a2'] })
    })

    await waitFor(() => {
      expect(result.current.agentStreams.get('a2')?.text).toBe('Second')
    })

    // Previous agent's stream should be gone (reset)
    expect(result.current.agentStreams.has('a1')).toBe(false)
    expect(result.current.result).toEqual({ responses: [{ agentId: 'a2', response: 'Second' }], workspaceChatId: 'wc2' })
  })

  it('ignores unknown SSE event types', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('tool_call', { name: 'read_file', agentId: 'a1' }),
      sse('text_delta', { delta: 'Hello', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', { responses: [{ agentId: 'a1', response: 'Hello' }], workspaceChatId: 'wc1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })
    expect(result.current.agentStreams.get('a1')?.text).toBe('Hello')
    expect(result.current.error).toBeNull()
  })

  it('routes text_delta to the correct agent based on agentId in the event', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('text_delta', { delta: 'Write', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('workspace_agent_start', { agentId: 'a2', agentName: 'Reviewer' }),
      sse('text_delta', { delta: 'Review', agentId: 'a2' }),
      sse('workspace_agent_end', { agentId: 'a2' }),
      sse('done', {
        responses: [
          { agentId: 'a1', response: 'Write' },
          { agentId: 'a2', response: 'Review' },
        ],
        workspaceChatId: 'wc1',
      }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1', 'a2'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Each agent gets only its own text
    expect(result.current.agentStreams.get('a1')?.text).toBe('Write')
    expect(result.current.agentStreams.get('a2')?.text).toBe('Review')
  })

  it('sends the correct request body', async () => {
    const body = sseStream([
      sse('done', { responses: [], workspaceChatId: 'wc1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1', 'a2'] })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `${RELAY_URL}/api/workspace-chats/wc1/messages/stream`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'hi', agentIds: ['a1', 'a2'] }),
      }),
    )
  })

  it('marks agent as isComplete=false while streaming and true after agent_end', async () => {
    // We need to test intermediate state — use a controlled stream
    let resolveChunk1: () => void
    let resolveChunk2: () => void

    const chunk1 = new Promise<void>((r) => { resolveChunk1 = r })
    const chunk2 = new Promise<void>((r) => { resolveChunk2 = r })

    const encoder = new TextEncoder()
    let chunkIndex = 0
    const chunks = [
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' }),
      sse('text_delta', { delta: 'Hello', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', { responses: [{ agentId: 'a1', response: 'Hello' }], workspaceChatId: 'wc1' }),
    ]

    const body = new ReadableStream({
      async pull(controller) {
        if (chunkIndex === 0) {
          controller.enqueue(encoder.encode(chunks[0]))
          chunkIndex++
          resolveChunk1!()
        } else if (chunkIndex === 1) {
          await chunk2
          // Send remaining chunks
          for (let i = 1; i < chunks.length; i++) {
            controller.enqueue(encoder.encode(chunks[i]))
          }
          controller.close()
        }
      },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    // Wait for first chunk (workspace_agent_start)
    await chunk1

    // After agent_start but before agent_end — isComplete should be false
    await waitFor(() => {
      expect(result.current.agentStreams.has('a1')).toBe(true)
    })
    expect(result.current.agentStreams.get('a1')?.isComplete).toBe(false)

    // Release the rest
    await act(async () => {
      resolveChunk2!()
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(result.current.agentStreams.get('a1')?.isComplete).toBe(true)
 })

  it('cancel() aborts mid-stream, preserves partial agent text, clears isStreaming', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array>
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) { controller = c },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    // Start an agent and stream some text
    await act(async () => {
      controller!.enqueue(encoder.encode(sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' })))
      controller!.enqueue(encoder.encode(sse('text_delta', { delta: 'Hello', agentId: 'a1' })))
    })

    await waitFor(() => {
      expect(result.current.agentStreams.get('a1')?.text).toBe('Hello')
    })
    expect(result.current.isStreaming).toBe(true)

    // Abort
    await act(async () => {
      result.current.cancel()
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Partial text is preserved
    expect(result.current.agentStreams.get('a1')?.text).toBe('Hello')
    // No error
    expect(result.current.error).toBeNull()
    // Result not set
    expect(result.current.result).toBeNull()
  })

  it('cancel() when not streaming is a no-op', () => {
    const { result } = renderHook(() => useStreamingWorkspaceChat())

    expect(() => result.current.cancel()).not.toThrow()
    expect(result.current.isStreaming).toBe(false)
  })

  it('sending a new message after cancel works normally', async () => {
    // First: start a stream, then cancel
    let controller: ReadableStreamDefaultController<Uint8Array>
    const encoder = new TextEncoder()
    const body1 = new ReadableStream<Uint8Array>({
      start(c) { controller = c },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body1,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'] })
    })

    await act(async () => {
      controller!.enqueue(encoder.encode(sse('workspace_agent_start', { agentId: 'a1', agentName: 'Writer' })))
      controller!.enqueue(encoder.encode(sse('text_delta', { delta: 'Partial', agentId: 'a1' })))
    })

    await waitFor(() => {
      expect(result.current.agentStreams.get('a1')?.text).toBe('Partial')
    })

    await act(async () => {
      result.current.cancel()
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Now send a second message
    const body2 = sseStream([
      sse('workspace_agent_start', { agentId: 'a2', agentName: 'Reviewer' }),
      sse('text_delta', { delta: 'New', agentId: 'a2' }),
      sse('workspace_agent_end', { agentId: 'a2' }),
      sse('done', { responses: [{ agentId: 'a2', response: 'New' }], workspaceChatId: 'wc2' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body2,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    await act(async () => {
      result.current.send({ chatId: 'wc2', prompt: 'again', agentIds: ['a2'] })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual({ responses: [{ agentId: 'a2', response: 'New' }], workspaceChatId: 'wc2' })
    })
    expect(result.current.error).toBeNull()
  })

  it('passes attachments in the request body (F8)', async () => {
    const body = sseStream([
      sse('workspace_agent_start', { agentId: 'a1', agentName: 'Bot' }),
      sse('text_delta', { delta: 'Read your file.', agentId: 'a1' }),
      sse('workspace_agent_end', { agentId: 'a1' }),
      sse('done', { responses: [{ agentId: 'a1', response: 'Read your file.' }], workspaceChatId: 'wc1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const attachments = [{ name: 'data.csv', path: 'uploads/data.csv', size: 2048 }]

    const { result } = renderHook(() => useStreamingWorkspaceChat())

    await act(async () => {
      result.current.send({ chatId: 'wc1', prompt: 'hi', agentIds: ['a1'], attachments })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `${RELAY_URL}/api/workspace-chats/wc1/messages/stream`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'hi', agentIds: ['a1'], attachments }),
      }),
    )
  })
})
