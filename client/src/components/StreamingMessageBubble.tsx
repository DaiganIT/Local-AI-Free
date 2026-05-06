import { useRef, useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'

interface StreamingMessageBubbleProps {
  /** The incremental text content being streamed (grows as deltas arrive). */
  content: string
  /** Whether the stream is still active — shows blinking cursor. */
  isStreaming: boolean
  /** Optional thinking/reasoning content being streamed. */
  thinkingContent?: string
  /** Whether thinking events are still being streamed. */
  isThinkingStreaming?: boolean
  /** Optional sender name — shows agent initial + label instead of Bot icon. */
  senderName?: string
}

export function StreamingMessageBubble({
  content,
  isStreaming,
  thinkingContent,
  isThinkingStreaming = false,
  senderName,
}: StreamingMessageBubbleProps) {
  return (
    <div className="flex justify-start animate-fade-up">
      <div className="max-w-[65%] flex items-end gap-2">
        <div className="streaming-avatar w-7 h-7 rounded-full bg-[hsl(200_85%_55%)]/20 border border-[hsl(200_85%_55%)]/30 flex items-center justify-center flex-shrink-0">
          {senderName ? (
            <span className="text-[10px] font-bold text-[hsl(200_85%_55%)]" data-testid="agent-initial">
              {senderName.charAt(0).toUpperCase()}
            </span>
          ) : (
            <Bot className="w-3.5 h-3.5 text-[hsl(200_85%_55%)]" />
          )}
        </div>
        <div>
          {senderName && (
            <div className="text-[10px] font-semibold text-[hsl(200_85%_55%)] mb-0.5 ml-0.5" data-testid="agent-name">
              {senderName}
            </div>
          )}
          {thinkingContent && (
            <StreamingThinkingBlock content={thinkingContent} isThinkingStreaming={isThinkingStreaming} />
          )}
          {(content || isStreaming) && (
            <div className="msg-content msg-assistant relative">
              <MarkdownContent
                content={content}
                trailing={isStreaming ? (
                  <span
                    data-streaming-cursor
                    className="inline-block w-[2px] h-[1.1em] bg-[hsl(200_85%_55%)] ml-0.5 -mb-[0.35em] animate-blink"
                  />
                ) : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StreamingThinkingBlock({
  content,
  isThinkingStreaming,
}: {
  content: string
  isThinkingStreaming: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [exiting, setExiting] = useState(false)
  const [mounted, setMounted] = useState(true)
  const didStreamRef = useRef(isThinkingStreaming)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [content])

  useEffect(() => {
    if (isThinkingStreaming) {
      didStreamRef.current = true
    } else if (didStreamRef.current) {
      setExiting(true)
    }
  }, [isThinkingStreaming])

  if (!mounted) return null

  return (
    <div
      data-thinking-panel
      {...(exiting ? { 'data-thinking-exiting': '' } : {})}
      className="mb-1.5 overflow-hidden"
      style={{
        transition: 'opacity 400ms ease, max-height 400ms ease',
        opacity: exiting ? 0 : 1,
        maxHeight: exiting ? '0' : '999px',
      }}
      onTransitionEnd={() => {
        if (exiting) setMounted(false)
      }}
    >
      <div className="flex items-center gap-1.5 px-0.5 mb-1">
        <span className="text-[11px] font-medium text-[hsl(210_8%_45%)]">Thinking…</span>
        {isThinkingStreaming && (
          <span
            data-thinking-streaming
            className="w-1.5 h-1.5 rounded-full bg-[hsl(200_85%_55%)] animate-pulse"
          />
        )}
      </div>
      <div
        ref={scrollRef}
        data-thinking-scroll
        className="max-h-48 overflow-y-auto text-[0.78rem] text-[hsl(210_8%_40%)] leading-relaxed whitespace-pre-wrap [mask-image:linear-gradient(to_bottom,transparent_0%,black_20%,black_100%)]"
      >
        {content}
      </div>
    </div>
  )
}
