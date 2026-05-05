import { useState, useCallback, useRef } from 'react'

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_RELAY_API_KEY ?? ''

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) h['X-API-Key'] = API_KEY
  return h
}

export interface AgentStreamState {
  text: string
  thinking: string
  isThinkingStreaming: boolean
  isComplete: boolean
  agentName: string
}

export interface WorkspaceStreamResult {
  responses: Array<{ agentId: string; response: string }>
  workspaceChatId: string
  errors?: Array<{ agentId: string; message: string }>
}

export interface UseStreamingWorkspaceChatReturn {
  /** Per-agent streaming state. */
  agentStreams: Map<string, AgentStreamState>
  /** True while SSE stream is active. */
  isStreaming: boolean
  /** Error message if something went wrong. */
  error: string | null
  /** Final result from the `done` event. Null until stream completes. */
  result: WorkspaceStreamResult | null
  /** Start a streaming request. Resets all state. */
  send: (params: { chatId: string; prompt: string; agentIds: string[]; attachments?: Array<{ name: string; path: string; size: number }> | null }) => void
  /** Abort the current stream. No-op if not streaming. Partial agent text is preserved. */
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

export function useStreamingWorkspaceChat(): UseStreamingWorkspaceChatReturn {
  const [agentStreams, setAgentStreams] = useState<Map<string, AgentStreamState>>(new Map())
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WorkspaceStreamResult | null>(null)
  const bufferRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setIsStreaming(false)
    }
  }, [])

  const send = useCallback(
    ({ chatId, prompt, agentIds, attachments }: { chatId: string; prompt: string; agentIds: string[]; attachments?: Array<{ name: string; path: string; size: number }> | null }) => {
      // Abort any existing stream
      if (abortRef.current) {
        abortRef.current.abort()
      }

      // Reset state for new request
      setAgentStreams(new Map())
      setIsStreaming(true)
      setError(null)
      setResult(null)
      bufferRef.current = ''

      const controller = new AbortController()
      abortRef.current = controller

      fetch(`${RELAY_URL}/api/workspace-chats/${chatId}/messages/stream`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ prompt, agentIds, attachments }),
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
                const parsed = JSON.parse(evt.data) as Record<string, unknown>

                if (evt.event === 'workspace_agent_start') {
                  const agentId = String(parsed.agentId)
                  const agentName = String(parsed.agentName ?? '')
                  setAgentStreams((prev) => {
                    const next = new Map(prev)
                    next.set(agentId, {
                      text: '',
                      thinking: '',
                      isThinkingStreaming: false,
                      isComplete: false,
                      agentName,
                    })
                    return next
                  })
                } else if (evt.event === 'workspace_agent_end') {
                  const agentId = String(parsed.agentId)
                  // Mark this agent as complete, but keep currentAgentId
                  // (it will be updated by the next workspace_agent_start or cleared on done)
                  setAgentStreams((prev) => {
                    const next = new Map(prev)
                    const existing = next.get(agentId)
                    if (existing) {
                      next.set(agentId, { ...existing, isComplete: true, isThinkingStreaming: false })
                    }
                    return next
                  })
                } else if (evt.event === 'text_delta') {
                  const delta = String(parsed.delta ?? '')
                  const agentId = String(parsed.agentId ?? '')
                  if (agentId && delta) {
                    setAgentStreams((prev) => {
                      const next = new Map(prev)
                      const existing = next.get(agentId)
                      if (existing) {
                        next.set(agentId, { ...existing, text: existing.text + delta })
                      }
                      return next
                    })
                  }
                } else if (evt.event === 'thinking_start') {
                  const agentId = String(parsed.agentId ?? '')
                  if (agentId) {
                    setAgentStreams((prev) => {
                      const next = new Map(prev)
                      const existing = next.get(agentId)
                      if (existing) {
                        next.set(agentId, { ...existing, isThinkingStreaming: true })
                      }
                      return next
                    })
                  }
                } else if (evt.event === 'thinking_delta') {
                  const delta = String(parsed.delta ?? '')
                  const agentId = String(parsed.agentId ?? '')
                  if (agentId && delta) {
                    setAgentStreams((prev) => {
                      const next = new Map(prev)
                      const existing = next.get(agentId)
                      if (existing) {
                        next.set(agentId, { ...existing, thinking: existing.thinking + delta })
                      }
                      return next
                    })
                  }
                } else if (evt.event === 'thinking_end') {
                  const agentId = String(parsed.agentId ?? '')
                  if (agentId) {
                    setAgentStreams((prev) => {
                      const next = new Map(prev)
                      const existing = next.get(agentId)
                      if (existing) {
                        next.set(agentId, { ...existing, isThinkingStreaming: false })
                      }
                      return next
                    })
                  }
                } else if (evt.event === 'done') {
                  setResult(parsed as unknown as WorkspaceStreamResult)
                  setIsStreaming(false)
                } else if (evt.event === 'error') {
                  setError(String(parsed.error ?? 'Unknown error'))
                  setIsStreaming(false)
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
            return
          }
          const message = err instanceof Error ? err.message : 'Stream failed'
          setError(message)
          setIsStreaming(false)
        })
    },
    [],
  )

  return { agentStreams, isStreaming, error, result, send, cancel }
}
