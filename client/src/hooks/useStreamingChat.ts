import { useState, useCallback, useRef } from 'react'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface StreamResult {
  response: string
  chatId?: string
  userMessageId?: string
  agentId?: string
}

export interface UseStreamingChatReturn {
  /** Accumulated text from text_delta events during streaming. */
  streamingText: string
  /** Accumulated thinking text from thinking_delta events during streaming. */
  streamingThinking: string
  /** True while SSE stream is active. */
  isStreaming: boolean
  /** True while thinking events are being streamed (between thinking_start and thinking_end). */
  isThinkingStreaming: boolean
  /** Error message if something went wrong. */
  error: string | null
  /** Final result from the `done` event. Null until stream completes. */
  result: StreamResult | null
  /** Start a streaming request. Resets all state. */
  send: (params: { agentId: string; prompt: string; chatId?: string; attachments?: Array<{ name: string; path: string; size: number }> | null }) => void
  /** Abort the current stream. No-op if not streaming. Partial text is preserved. */
  cancel: () => void
}

interface SseEvent {
  event: string
  data: string
}

/**
 * Parse a chunk of SSE text into individual events.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 * Events may span multiple chunks or a chunk may contain multiple events.
 */
function parseSseChunk(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = []
  let remaining = buffer

  while (true) {
    const endIdx = remaining.indexOf('\n\n')
    if (endIdx === -1) break

    const block = remaining.slice(0, endIdx)
    remaining = remaining.slice(endIdx + 2)

    let event = ''
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice(7)
      } else if (line.startsWith('data: ')) {
        data = line.slice(6)
      }
    }

    if (event && data) {
      events.push({ event, data })
    }
  }

  return { events, remainder: remaining }
}

export function useStreamingChat(): UseStreamingChatReturn {
  const [streamingText, setStreamingText] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isThinkingStreaming, setIsThinkingStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StreamResult | null>(null)
  const bufferRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setIsStreaming(false)
      setIsThinkingStreaming(false)
    }
  }, [])

  const send = useCallback(({ agentId, prompt, chatId, attachments }: { agentId: string; prompt: string; chatId?: string; attachments?: Array<{ name: string; path: string; size: number }> | null }) => {
    // Abort any existing stream
    if (abortRef.current) {
      abortRef.current.abort()
    }

    // Reset state for new request
    setStreamingText('')
    setStreamingThinking('')
    setIsStreaming(true)
    setIsThinkingStreaming(false)
    setError(null)
    setResult(null)
    bufferRef.current = ''

    const controller = new AbortController()
    abortRef.current = controller

    fetch(`${RELAY_URL}/api/chat/stream`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ agentId, prompt, chatId, attachments }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          let message = `HTTP ${res.status}`
          try {
            const body = await res.json() as { error?: string }
            if (body.error) message = body.error
          } catch {
            // use default message
          }
          setStreamingText('')
          setIsStreaming(false)
          setError(message)
          return
        }

        if (!res.body) {
          setIsStreaming(false)
          setError('No response body')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            bufferRef.current += decoder.decode(value, { stream: true })
            const { events, remainder } = parseSseChunk(bufferRef.current)
            bufferRef.current = remainder

            for (const evt of events) {
              if (evt.event === 'text_delta') {
                const parsed = JSON.parse(evt.data) as { delta: string }
                setStreamingText((prev) => prev + parsed.delta)
              } else if (evt.event === 'thinking_start') {
                setIsThinkingStreaming(true)
              } else if (evt.event === 'thinking_delta') {
                const parsed = JSON.parse(evt.data) as { delta: string }
                setStreamingThinking((prev) => prev + parsed.delta)
              } else if (evt.event === 'thinking_end') {
                setIsThinkingStreaming(false)
              } else if (evt.event === 'done') {
                const parsed = JSON.parse(evt.data) as StreamResult
                setResult(parsed)
                setIsStreaming(false)
                setIsThinkingStreaming(false)
              } else if (evt.event === 'error') {
                const parsed = JSON.parse(evt.data) as { error: string }
                setError(parsed.error)
                setIsStreaming(false)
                setIsThinkingStreaming(false)
              }
              // Unknown event types are silently ignored
            }
          }
        } finally {
          reader.releaseLock()
        }
      })
      .catch((err: unknown) => {
        // Abort is intentional — don't show as error
        if (err instanceof DOMException && err.name === 'AbortError') {
          setIsStreaming(false)
          setIsThinkingStreaming(false)
          return
        }
        const message = err instanceof Error ? err.message : 'Stream failed'
        setError(message)
        setIsStreaming(false)
      })
  }, [])

  return { streamingText, streamingThinking, isStreaming, isThinkingStreaming, error, result, send, cancel }
}
