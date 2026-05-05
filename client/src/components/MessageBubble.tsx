import { useState, useCallback, useMemo } from 'react'
import { Bot, ChevronDown, ChevronRight, Paperclip } from 'lucide-react'
import { formatTime } from '../lib/formatting'
import { parseReasoning } from '../lib/parseReasoning'

interface MessageBubbleProps {
  msg: {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    attachments?: Array<{ name: string; path: string; size: number }> | null
  }
  isLast: boolean
  isLoading?: boolean
}

export function MessageBubble({ msg, isLast, isLoading }: MessageBubbleProps) {
  const isUser = msg.role === 'user'
  const time = formatTime(msg.timestamp)

  const segments = useMemo(() => {
    if (isUser) return null
    return parseReasoning(msg.content)
  }, [isUser, msg.content])

  const hasReasoning = segments !== null && segments.some(s => s.type === 'reasoning')

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up ${isLast ? 'mb-1' : ''}`}
    >
      <div
        className={`max-w-[65%] flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
      >
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-[hsl(200_85%_55%)]/20 border border-[hsl(200_85%_55%)]/30 flex items-center justify-center flex-shrink-0">
            <Bot className="w-3.5 h-3.5 text-[hsl(200_85%_55%)]" />
          </div>
        )}
        <div>
          {!isUser && hasReasoning && segments && (
            <ReasoningSegments segments={segments} isLoading={isLoading ?? false} />
          )}
          {isUser && !hasReasoning && (
            <div
              className={`msg-content msg-user relative ${isLoading ? 'opacity-60' : ''}`}
            >
              {msg.content}
              {msg.attachments && msg.attachments.length > 0 && (
                <MessageAttachments attachments={msg.attachments} />
              )}
            </div>
          )}
          {!isUser && !hasReasoning && (
            <div
              className={`msg-content msg-assistant relative ${isLoading ? 'opacity-60' : ''}`}
            >
              {msg.content}
            </div>
          )}
          <div
            className={`text-[10px] text-[hsl(210_6%_40%)] mt-1 ${isUser ? 'text-right' : ''}`}
          >
            {time}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReasoningSegments({ segments, isLoading }: { segments: Array<{ type: 'text' | 'reasoning'; content: string }>; isLoading: boolean }) {
  return (
    <>
      {segments.map((seg, i) => (
        seg.type === 'reasoning'
          ? <ReasoningBlock key={i} content={seg.content} />
          : seg.content
            ? <div
                key={i}
                className={`msg-content msg-assistant relative ${isLoading ? 'opacity-60' : ''}`}
              >
                {seg.content}
              </div>
            : null
      ))}
    </>
  )
}

function ReasoningBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen(prev => !prev), [])

  return (
    <div className="mb-1.5">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[11px] text-[hsl(210_8%_50%)] hover:text-[hsl(200_85%_55%)] transition-colors cursor-pointer bg-[hsl(208_25%_10%)] border border-[hsl(208_25%_14%)] rounded-md px-2.5 py-1.5 w-full"
      >
        {open
          ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 flex-shrink-0" />
        }
        <span>Thoughts</span>
        <span className="text-[10px] text-[hsl(210_6%_35%)] ml-auto">{content.length} chars</span>
      </button>
      {open && (
        <div className="mt-1 bg-[hsl(208_25%_8%)] border border-[hsl(208_25%_12%)] rounded-md px-3 py-2 text-[0.8rem] text-[hsl(210_8%_55%)] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-up">
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full bg-[hsl(200_85%_55%)]/20 border border-[hsl(200_85%_55%)]/30 flex items-center justify-center flex-shrink-0">
          <Bot className="w-3.5 h-3.5 text-[hsl(200_85%_55%)]" />
        </div>
        <div className="msg-content msg-assistant relative py-2">
          <div className="flex gap-1 items-center px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(200_85%_55%)]/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(200_85%_55%)]/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(200_85%_55%)]/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageAttachments({ attachments }: { attachments: Array<{ name: string; path: string; size: number }> }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5" data-message-attachments>
      {attachments.map((att) => (
        <span
          key={att.path}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[hsl(208_25%_16%)] border border-[hsl(208_25%_20%)] text-[hsl(210_8%_75%)]"
        >
          <Paperclip className="w-3 h-3 text-[hsl(200_85%_55%)]" />
          {att.name}
        </span>
      ))}
    </div>
  )
}
