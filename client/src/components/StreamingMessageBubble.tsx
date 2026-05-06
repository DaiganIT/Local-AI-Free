import { useState, useCallback } from 'react'
import { Bot, ChevronDown, ChevronRight } from 'lucide-react'
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
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((prev) => !prev), [])

  return (
    <div className="mb-1.5">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[11px] text-[hsl(210_8%_50%)] hover:text-[hsl(200_85%_55%)] transition-colors cursor-pointer bg-[hsl(208_25%_10%)] border border-[hsl(208_25%_14%)] rounded-md px-2.5 py-1.5 w-full"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
        )}
        <span>Thoughts</span>
        {isThinkingStreaming && (
          <span data-thinking-streaming className="w-1.5 h-1.5 rounded-full bg-[hsl(200_85%_55%)] animate-pulse ml-1" />
        )}
        <span className="text-[10px] text-[hsl(210_6%_35%)] ml-auto">
          {content.length} chars
        </span>
      </button>
      {open && (
        <div className="mt-1 bg-[hsl(208_25%_8%)] border border-[hsl(208_25%_12%)] rounded-md px-3 py-2 text-[0.8rem] text-[hsl(210_8%_55%)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
          {content}
          {isThinkingStreaming && (
            <span
              data-streaming-cursor
              className="inline-block w-[2px] h-[1em] bg-[hsl(200_85%_55%)] ml-0.5 align-text-bottom animate-blink"
            />
          )}
        </div>
      )}
    </div>
  )
}
