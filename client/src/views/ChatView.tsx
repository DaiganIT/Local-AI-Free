import { useQueryClient } from '@tanstack/react-query'
import { useAgent, useChatDetail, useDeleteChat, useStreamingChat, usePendingAttachments } from '#/hooks'
import { Send, Hash, Trash2, MoreVertical, Info, Square, Paperclip } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { Message } from '../lib/types'
import { useNavigate } from '@tanstack/react-router'
import { nav } from '#/lib/navigation'
import { MessageBubble } from '../components/MessageBubble'
import { StreamingMessageBubble } from '../components/StreamingMessageBubble'
import { formatTokenCount } from '../lib/formatting'
import { AgentWorkspaceExplorer } from '#/components/AgentWorkspaceExplorer'
import { useDeleteAgentFile } from '#/hooks/useDeleteFile'
import { ArtifactPanel } from '#/components/ArtifactPanel'
import { AttachmentChips } from '#/components/AttachmentChips'
import { MentionInput } from '#/components/MentionInput'
import type { MentionInputHandle } from '#/components/MentionInput'

interface ChatViewProps {
  agentId: string
  chatId?: string
  hostId: string
  /** Currently-open workspace-relative file path (from URL search). */
  openFilePath?: string
}

export function ChatView({ agentId, chatId, hostId, openFilePath }: ChatViewProps) {
  const { data: agent } = useAgent(agentId)
  const { data: chatDetail, isLoading: isLoadingDetail } = useChatDetail(chatId ?? '')
  const deleteChatMutation = useDeleteChat()
  const deleteFile = useDeleteAgentFile(agentId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [localMsgs, setLocalMsgs] = useState<Message[]>([])
  const [hasInputText, setHasInputText] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const mentionInputRef = useRef<MentionInputHandle>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isUploading,
  } = usePendingAttachments({ agentId })

  const {
    streamingText,
    streamingThinking,
    isStreaming,
    isThinkingStreaming,
    error: streamingError,
    result: streamingResult,
    send: streamingSend,
    cancel: streamingCancel,
  } = useStreamingChat()

  // Track whether we've already processed a streaming result to avoid double-handling
  const prevResultChatIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatDetail?.messages.length, localMsgs.length, streamingText.length])

  // When streaming result arrives, add the assistant reply to local messages
  // and handle new-chat navigation
  useEffect(() => {
    if (!streamingResult) return
    // Avoid re-processing the same result
    if (prevResultChatIdRef.current === streamingResult.chatId && streamingResult.chatId) return
    prevResultChatIdRef.current = streamingResult.chatId

    // If the server auto-created a new chat, navigate to it
    if (streamingResult.chatId && !chatId) {
      queryClient.invalidateQueries({ queryKey: ['chats', agentId] })
      const navHostId = agent?.hostId ?? ''
      navigate({ to: `/hosts/${navHostId}/a/${agentId}/c/${streamingResult.chatId}`, replace: true })
      return
    }

    // Add the assistant reply to local messages
    const reply: Message = {
      id: `msg-a-${Date.now()}`,
      agentId,
      role: 'assistant',
      content: streamingResult.response,
      timestamp: new Date().toISOString(),
    }
    setLocalMsgs((prev) => [...prev, reply])

    // Refresh the chat list so the sidebar shows the updated title
    queryClient.invalidateQueries({ queryKey: ['chats', agentId] })

    // Refetch to get the persisted messages, then clear local
    if (chatId) {
      queryClient.invalidateQueries({ queryKey: ['chat-detail', chatId] })
      setTimeout(() => {
        setLocalMsgs([])
        queryClient.invalidateQueries({ queryKey: ['chat-detail', chatId] })
      }, 500)
    }
  }, [streamingResult, chatId, agentId, agent?.hostId, navigate, queryClient])

  // Show streaming error as a local message
  useEffect(() => {
    if (!streamingError) return
    const errorMsg: Message = {
      id: `msg-e-${Date.now()}`,
      agentId,
      role: 'assistant',
      content: `Error: ${streamingError}`,
      timestamp: new Date().toISOString(),
    }
    setLocalMsgs((prev) => [...prev, errorMsg])
  }, [streamingError, agentId])

  const messages = chatDetail
    ? [...chatDetail.messages, ...localMsgs]
    : localMsgs

  const handleSend = () => {
    const text = mentionInputRef.current?.getText().trim() ?? ''
    const mentions = mentionInputRef.current?.getMentions() ?? []
    if ((!text && mentions.length === 0) || !agentId || isStreaming || isUploading) return

    mentionInputRef.current?.clear()

    const uploadAttachments = attachments
      .filter((a) => a.status === 'done' && a.serverPath && a.size !== undefined)
      .map((a) => ({ name: a.name, path: a.serverPath!, size: a.size!, mimeType: a.mimeType }))

    const mentionAttachments = mentions
      .filter((a) => a.serverPath)
      .map((a) => ({ name: a.name, path: a.serverPath!, size: 0 }))

    // The API receives all attachments so the LLM can call read_attachment
    const apiAttachments = [...uploadAttachments, ...mentionAttachments]
    // The displayed message only shows uploaded file chips — mentions appear inline as @filename in the text
    const displayAttachments = uploadAttachments

    clearAttachments()

    const localUserMsg: Message = {
      id: `msg-u-${Date.now()}`,
      agentId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: displayAttachments.length > 0 ? displayAttachments : null,
    }
    setLocalMsgs((prev) => [...prev, localUserMsg])
    prevResultChatIdRef.current = undefined

    streamingSend({ agentId, prompt: text, chatId, attachments: apiAttachments.length > 0 ? apiAttachments : undefined })
  }

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      addFiles(Array.from(files))
    }
    // Reset so the same file can be selected again
    e.target.value = ''
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      addFiles(Array.from(files))
    }
  }, [addFiles])

  const handleDelete = async () => {
    if (!chatId) return
    await deleteChatMutation.mutateAsync(chatId)
    const hostId = agent?.hostId || ''
    if (hostId) {
      navigate({ to: nav.agent(hostId, agentId) })
    }
  }

  if (isLoadingDetail) {
    return (
      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        <header className="h-12 px-4 flex items-center justify-between border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
          <div className="h-4 w-28 bg-[hsl(208_25%_16%)] rounded animate-pulse" />
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-sm text-[hsl(210_8%_65%)]">Loading conversation...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      {/* Main chat column */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <header className="h-12 px-4 flex items-center justify-between border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-[hsl(210_8%_50%)]" />
            <span className="font-semibold text-[hsl(210_13%_95%)]">
              {chatDetail?.chat.title || agent?.name}
            </span>
            {agent && (
              <span className="text-xs text-[hsl(210_6%_40%)] ml-2">
                {agent.status === 'online' && (
                  <span className="text-[hsl(153_46%_49%)]">● </span>
                )}
                {agent.status} — {agent.model}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[hsl(210_8%_65%)]">
            {chatId && (
              <Trash2
                className="w-5 h-5 hover:text-[hsl(0_85%_55%)] cursor-pointer transition-colors"
                onClick={handleDelete}
              />
            )}
            <MoreVertical className="w-5 h-5 hover:text-[hsl(210_13%_95%)] cursor-pointer" />
          </div>
        </header>

        {/* Description bar */}
        {agent && agent.description && (
          <div className="px-4 py-2 bg-[hsl(208_25%_9%)] border-b border-[hsl(208_25%_8%)] text-xs text-[hsl(210_8%_65%)]">
            {agent.description}
          </div>
        )}

        {/* Messages */}
        <div
          className={`flex-1 overflow-y-auto px-4 py-4 space-y-1 transition-colors ${
            isDragOver ? 'bg-[hsl(200_85%_55%)]/5 outline outline-2 outline-dashed outline-[hsl(200_85%_55%)]/30 outline-offset-[-4px] rounded-lg' : ''
          }`
          }
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {messages.length === 0 && !isStreaming ? (
            <div className="flex items-center justify-center h-full text-sm text-[hsl(210_8%_65%)]">
              {chatId ? 'No messages yet. Start the conversation!' : `Start chatting with ${agent?.name}`}
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isLast={i === messages.length - 1 && !isStreaming}
                isLoading={isStreaming && i === messages.length - 1 && msg.role === 'user'}
              />
            ))
          )}
          {isStreaming && (
            <StreamingMessageBubble
              content={streamingText}
              isStreaming={isStreaming}
              thinkingContent={streamingThinking || undefined}
              isThinkingStreaming={isThinkingStreaming}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Aggregate chat stats bar */}
        <AggregateStatsBar
          tokensIn={chatDetail?.totalIn ?? 0}
          tokensOut={chatDetail?.totalOut ?? 0}
          tokensReasoning={chatDetail?.totalReasoning}
          contextUsed={chatDetail?.contextUsed}
          contextLength={chatDetail?.contextLength}
        />

        {/* Input bar */}
        <div className="px-4 pb-4 flex-shrink-0 space-y-2">
          {/* Upload attachment chips */}
          {attachments.length > 0 && (
            <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
          )}

          <div className="relative flex items-center gap-1">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.yaml,.yml,.xml,.sql,.sh,.bat,.log,.ini,.cfg,.toml,.rs,.go,.java,.c,.cpp,.h,.rb,.php,.swift,.kt,.r,.lua,.pl"
            />

            {/* + button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              className="p-2 rounded-lg text-[hsl(210_8%_65%)] hover:text-[hsl(200_85%_55%)] hover:bg-[hsl(200_85%_55%)]/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Rich text input — handles @-mention chips inline */}
            <MentionInput
              ref={mentionInputRef}
              agentId={agentId}
              placeholder={isStreaming ? 'Waiting for response...' : isUploading ? 'Uploading file...' : `Message ${agent?.name}...`}
              disabled={isStreaming || isUploading}
              onSend={handleSend}
              onHasTextChange={setHasInputText}
            />

            {/* Send / Cancel button */}
            <button
              onClick={isStreaming ? streamingCancel : handleSend}
              disabled={!isStreaming && (!hasInputText || !agentId || isUploading)}
              className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isStreaming
                  ? 'text-[hsl(0_85%_55%)] hover:bg-[hsl(0_85%_55%)]/10'
                  : 'text-[hsl(200_85%_55%)] hover:bg-[hsl(200_85%_55%)]/10'
              }`}
            >
              {isStreaming ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Artifact panel (when a file is selected) */}
      {openFilePath ? (
        <ArtifactPanel mode="agent" agentId={agentId} hostId={hostId} filePath={openFilePath} />
      ) : null}

      {/* Workspace explorer sidebar */}
      <aside className={`workspace-rail relative flex min-h-56 w-full shrink-0 flex-col border-l border-discord-border-subtle bg-discord-bg shadow-[inset_1px_0_0_hsl(200_85%_55%/18%),-18px_0_48px_-24px_rgb(0_0_0/0.52)] ${
        openFilePath ? 'md:min-h-0 md:w-56 xl:w-64' : 'md:min-h-0 md:w-80 xl:w-[22rem]'
      }`}>
        <AgentWorkspaceExplorer agentId={agentId} hostId={hostId} openFilePath={openFilePath} onDeleteFile={(nodeId) => {
          deleteFile.mutate({ path: nodeId }, {
            onSuccess: () => {
              if (openFilePath === nodeId) {
                navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, file: undefined }) })
              }
            },
          })
        }} />
      </aside>
    </div>
  )
}

/** Compute context usage % from server-provided values */
function computeContextPct(contextUsed: number | undefined, contextLength: number | undefined): number | undefined {
  if (!contextUsed || !contextLength) return undefined
  return Math.min(Math.round((contextUsed / contextLength) * 100), 100)
}

function AggregateStatsBar({
  tokensIn,
  tokensOut,
  tokensReasoning,
  contextUsed,
  contextLength,
}: {
  tokensIn: number
  tokensOut: number
  tokensReasoning?: number
  contextUsed?: number
  contextLength?: number
}) {
  const contextPct = computeContextPct(contextUsed, contextLength)
  const contextBarColor = (contextPct ?? 0) > 80
    ? 'text-[hsl(0_70%_55%)]'
    : (contextPct ?? 0) > 50
      ? 'text-[hsl(38_100%_58%)]'
      : 'text-[hsl(153_46%_49%)]'
  const contextBarBg = (contextPct ?? 0) > 80
    ? 'bg-[hsl(0_70%_55%)]'
    : (contextPct ?? 0) > 50
      ? 'bg-[hsl(38_100%_58%)]'
      : 'bg-[hsl(153_46%_49%)]'

  return (
    <div className="px-4 py-1.5 bg-[hsl(208_25%_9%)] border-b border-[hsl(208_25%_8%)]">
      <div className="inline-flex items-center gap-3 text-[10px] text-[hsl(210_6%_45%)] bg-[hsl(208_25%_10%)] border border-[hsl(208_25%_14%)] rounded-lg px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[hsl(210_8%_55%)]">In</span>
          <span className="font-semibold text-[hsl(210_13%_95%)] tabular-nums">
            {formatTokenCount(tokensIn)}
          </span>
        </div>
        <div className="w-px h-3 bg-[hsl(208_25%_18%)]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[hsl(210_8%_55%)]">Out</span>
          <span className="font-semibold text-[hsl(210_13%_95%)] tabular-nums">
            {formatTokenCount(tokensOut)}
          </span>
        </div>
        {tokensReasoning != null && tokensReasoning > 0 && (
          <>
            <div className="w-px h-3 bg-[hsl(208_25%_18%)]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[hsl(210_8%_55%)]">Reason</span>
              <span className="font-semibold text-[hsl(210_13%_95%)] tabular-nums">
                {formatTokenCount(tokensReasoning)}
              </span>
            </div>
          </>
        )}
        {contextPct !== undefined && (
          <>
            <div className="w-px h-3 bg-[hsl(208_25%_18%)]" />
            <div className="flex items-center gap-1.5 min-w-[100px]">
              <Info className="w-2.5 h-2.5 text-[hsl(210_8%_55%)] flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[hsl(210_8%_55%)]">Context</span>
                  <span
                    className={`font-semibold tabular-nums ${contextBarColor}`}
                  >
                    {contextPct}%
                  </span>
                </div>
                <div className="w-full h-1 rounded-full bg-[hsl(208_25%_18%)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${contextBarBg}`}
                    style={{ width: `${contextPct}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
