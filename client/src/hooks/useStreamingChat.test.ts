import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStreamingChat } from './useStreamingChat'

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

describe('useStreamingChat', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('accumulates text_delta events into streamingText', async () => {
    const body = sseStream([
      sse('text_delta', { delta: 'Hello' }),
      sse('text_delta', { delta: ' world' }),
      sse('done', { response: 'Hello world', chatId: 'c1', userMessageId: 'm1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Hello world')
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.result).toEqual({ response: 'Hello world', chatId: 'c1', userMessageId: 'm1' })
  })

  it('accumulates thinking_delta events into streamingThinking', async () => {
    const body = sseStream([
      sse('thinking_delta', { delta: 'Let me' }),
      sse('thinking_delta', { delta: ' think...' }),
      sse('text_delta', { delta: 'Answer' }),
      sse('done', { response: 'Answer', chatId: 'c1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.streamingThinking).toBe('Let me think...')
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

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
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

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('handles network error (fetch rejects)', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Network error')
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('resets streaming state on each new send', async () => {
    // First call
    const body1 = sseStream([
      sse('text_delta', { delta: 'First' }),
      sse('done', { response: 'First', chatId: 'c1' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body1,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual({ response: 'First', chatId: 'c1' })
    })

    // Second call — state should reset
    const body2 = sseStream([
      sse('text_delta', { delta: 'Second' }),
      sse('done', { response: 'Second', chatId: 'c2' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body2,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'again' })
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Second')
    })
    expect(result.current.result).toEqual({ response: 'Second', chatId: 'c2' })
  })

  it('ignores unknown SSE event types', async () => {
    const body = sseStream([
      sse('tool_call', { name: 'read_file' }),
      sse('text_delta', { delta: 'Hello' }),
      sse('done', { response: 'Hello', chatId: 'c1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Hello')
    })
    // No error, no crash — unknown events are silently ignored
    expect(result.current.error).toBeNull()
  })

  it('tracks isThinkingStreaming from thinking_start and thinking_end events', async () => {
    const body = sseStream([
      sse('thinking_start', { contentIndex: 0 }),
      sse('thinking_delta', { delta: 'Hmm...' }),
      sse('thinking_end', { content: 'Hmm...', contentIndex: 0 }),
      sse('text_delta', { delta: 'Answer' }),
      sse('done', { response: 'Answer', chatId: 'c1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    // Before sending — not streaming
    expect(result.current.isThinkingStreaming).toBe(false)

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    // After done — thinking streaming should be false
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })
    expect(result.current.isThinkingStreaming).toBe(false)
    expect(result.current.streamingThinking).toBe('Hmm...')
  })

  it('resets isThinkingStreaming on new send', async () => {
    // First call with thinking
    const body1 = sseStream([
      sse('thinking_start', { contentIndex: 0 }),
      sse('thinking_delta', { delta: 'Think' }),
      sse('thinking_end', { content: 'Think', contentIndex: 0 }),
      sse('done', { response: 'ok', chatId: 'c1' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body1,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual({ response: 'ok', chatId: 'c1' })
    })

    // Second call without thinking — isThinkingStreaming should be reset to false
    const body2 = sseStream([
      sse('text_delta', { delta: 'No thinking' }),
      sse('done', { response: 'No thinking', chatId: 'c2' }),
    ])
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body2,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'again' })
    })

    await waitFor(() => {
      expect(result.current.streamingThinking).toBe('')
    })
    expect(result.current.isThinkingStreaming).toBe(false)
  })

  it('cancel() aborts mid-stream, preserves partial text, clears isStreaming', async () => {
    // Create a stream that we control — it won't complete until we let it
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

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    // Stream some text
    await act(async () => {
      controller!.enqueue(encoder.encode(sse('text_delta', { delta: 'Hello' })))
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Hello')
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
    expect(result.current.streamingText).toBe('Hello')
    // No error shown
    expect(result.current.error).toBeNull()
    // Result not set (stream didn't complete)
    expect(result.current.result).toBeNull()
  })

  it('cancel() when not streaming is a no-op', () => {
    const { result } = renderHook(() => useStreamingChat())

    // Should not throw
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

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi' })
    })

    await act(async () => {
      controller!.enqueue(encoder.encode(sse('text_delta', { delta: 'Partial' })))
    })

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Partial')
    })

    await act(async () => {
      result.current.cancel()
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    // Now send a second message — should work normally
    const body2 = sseStream([
      sse('text_delta', { delta: 'New' }),
      sse('done', { response: 'New', chatId: 'c2' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: body2,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'again' })
    })

    await waitFor(() => {
      expect(result.current.result).toEqual({ response: 'New', chatId: 'c2' })
    })
    expect(result.current.streamingText).toBe('New')
    expect(result.current.error).toBeNull()
  })

  it('passes chatId in the request body', async () => {
    const body = sseStream([
      sse('done', { response: 'ok', chatId: 'c1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi', chatId: 'c1' })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `${RELAY_URL}/api/chat/stream`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentId: 'a1', prompt: 'hi', chatId: 'c1' }),
      }),
    )
  })

  it('passes attachments in the request body (F8)', async () => {
    const body = sseStream([
      sse('done', { response: 'ok', chatId: 'c1' }),
    ])

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    } as Response)

    const attachments = [{ name: 'report.txt', path: 'uploads/report.txt', size: 1024 }]

    const { result } = renderHook(() => useStreamingChat())

    await act(async () => {
      result.current.send({ agentId: 'a1', prompt: 'hi', chatId: 'c1', attachments })
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      `${RELAY_URL}/api/chat/stream`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentId: 'a1', prompt: 'hi', chatId: 'c1', attachments }),
      }),
    )
  })
})
