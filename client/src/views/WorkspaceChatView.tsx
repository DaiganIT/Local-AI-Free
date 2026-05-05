import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Send, Square, Paperclip } from 'lucide-react'
import {
  useWorkspaces,
  useWorkspaceAgents,
  useAgents,
  useWorkspaceChatDetail,
  useStreamingWorkspaceChat,
  usePendingAttachments,
} from '#/hooks'
import type { WorkspaceMessage, AgentInfo } from '#/lib/types'
import { formatTime } from '#/lib/formatting'
import { parseReasoning } from '#/lib/parseReasoning'
import { WorkspaceExplorer } from '#/components/WorkspaceExplorer'
import { useDeleteWorkspaceFile } from '#/hooks/useDeleteFile'
import { ArtifactPanel } from '#/components/ArtifactPanel'
import { StreamingMessageBubble } from '#/components/StreamingMessageBubble'
import { AttachmentChips } from '#/components/AttachmentChips'

interface WorkspaceChatViewProps {
  workspaceId: string
  hostId: string
  chatId: string
  /** Currently-open workspace-relative file path (from URL search). */
  openFilePath?: string
}

export function WorkspaceChatView({ workspaceId, hostId, chatId, openFilePath }: WorkspaceChatViewProps) {
  const navigate = useNavigate()
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces(hostId)
  const { data: agentIds, isLoading: agentsLoading } = useWorkspaceAgents(workspaceId, hostId)
  const { data: agents } = useAgents()
  const { data: chatDetail, isLoading: chatLoading } = useWorkspaceChatDetail(chatId)
  const queryClient = useQueryClient()
  const deleteFile = useDeleteWorkspaceFile(workspaceId, hostId)

  // Streaming hook for workspace chat
  const {
    agentStreams,
    isStreaming,
    error: streamingError,
    result: streamingResult,
    send: streamingSend,
    cancel: streamingCancel,
  } = useStreamingWorkspaceChat()

  const [input, setInput] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [localMessages, setLocalMessages] = useState<WorkspaceMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
    isUploading,
  } = usePendingAttachments({ workspaceId, hostId })

  // Track whether we've already processed a streaming result
  const prevResultIdRef = useRef<string | undefined>(undefined)

  const workspace = workspaces?.find((w) => w.id === workspaceId)
  const workspaceAgents = (agentIds ?? [])
    .map((id) => agents?.find((a) => a.id === id))
    .filter(Boolean) as AgentInfo[]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatDetail?.messages.length, localMessages.length, agentStreams.size, Array.from(agentStreams.values()).reduce((acc, s) => acc + s.text.length, 0)])

  // When streaming result arrives, add agent responses to local messages
  useEffect(() => {
    if (!streamingResult) return
    // Avoid re-processing the same result
    if (prevResultIdRef.current === streamingResult.workspaceChatId) return
    prevResultIdRef.current = streamingResult.workspaceChatId

    // Add agent response messages locally
    for (const resp of streamingResult.responses) {
      const agentMsg: WorkspaceMessage = {
        id: `msg-a-${Date.now()}-${resp.agentId}`,
        workspaceChatId: chatId,
        senderType: 'agent',
        senderId: resp.agentId,
        content: resp.response,
        timestamp: new Date().toISOString(),
        modelUsed: '',
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      }
      setLocalMessages((prev) => [...prev, agentMsg])
    }

    // Refetch to get the persisted messages, then clear local
    queryClient.invalidateQueries({ queryKey: ['workspace-chat-detail', chatId] })
    setTimeout(() => {
      setLocalMessages([])
      queryClient.invalidateQueries({ queryKey: ['workspace-chat-detail', chatId] })
    }, 500)
  }, [streamingResult, chatId, queryClient])

  // Show streaming error as a local message
  useEffect(() => {
    if (!streamingError) return
    const errorMsg: WorkspaceMessage = {
      id: `msg-e-${Date.now()}`,
      workspaceChatId: chatId,
      senderType: 'agent',
      senderId: null,
      content: `Error: ${streamingError}`,
      timestamp: new Date().toISOString(),
      modelUsed: '',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    }
    setLocalMessages((prev) => [...prev, errorMsg])
  }, [streamingError, chatId])

  const messages = chatDetail
    ? [...chatDetail.messages, ...localMessages]
    : localMessages

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
    )
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || selectedAgentIds.length === 0 || isStreaming || isUploading) return
    setInput('')

    // Build attachments array from done uploads
    const messageAttachments = attachments
      .filter((a) => a.status === 'done' && a.serverPath && a.size !== undefined)
      .map((a) => ({ name: a.name, path: a.serverPath!, size: a.size!, mimeType: a.mimeType }))

    clearAttachments()

    // Add local user message
    const localUserMsg: WorkspaceMessage = {
      id: `msg-u-${Date.now()}`,
      workspaceChatId: chatId,
      senderType: 'user',
      senderId: null,
      content: text,
      timestamp: new Date().toISOString(),
      modelUsed: '',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      attachments: messageAttachments.length > 0 ? messageAttachments : null,
    }
    setLocalMessages((prev) => [...prev, localUserMsg])
    prevResultIdRef.current = undefined

    // Start streaming
    streamingSend({ chatId, prompt: text, agentIds: [...selectedAgentIds], attachments: messageAttachments.length > 0 ? messageAttachments : undefined })
  }

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      addFiles(Array.from(files))
    }
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

  if (wsLoading || agentsLoading || chatLoading || !workspace) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
          <div className="h-4 w-28 bg-[hsl(208_25%_16%)] rounded animate-pulse" />
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-sm text-[hsl(210_8%_65%)]">Loading workspace chat...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      {/* Main chat column */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* Header */}
        <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
          <FolderOpen className="w-5 h-5 text-[hsl(200_85%_55%)] mr-2" />
          <span className="font-semibold text-[hsl(210_13%_95%)]">
            {workspace.name}
          </span>
          {chatDetail?.chat.title && (
            <>
              <span className="mx-2 text-[hsl(210_6%_40%)]">/</span>
              <span className="text-sm text-[hsl(210_8%_65%)]">
                {chatDetail.chat.title}
              </span>
            </>
          )}
        </header>

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
          {messages.length === 0 && agentStreams.size === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-[hsl(210_8%_65%)]">
              No messages yet. Select an agent and start the conversation!
            </div>
          ) : (
            messages.map((msg, i) => (
              <WorkspaceMessageBubble
                key={msg.id}
                msg={msg}
                agents={workspaceAgents}
                isLast={i === messages.length - 1}
                isLoading={isStreaming && i === messages.length - 1 && msg.senderType === 'user'}
              />
            ))
          )}
          {/* Render streaming bubbles for each agent that has started */}
          {Array.from(agentStreams.entries()).map(([agentId, streamState]) => (
            <StreamingMessageBubble
              key={agentId}
              content={streamState.text}
              isStreaming={!streamState.isComplete}
              thinkingContent={streamState.thinking || undefined}
              isThinkingStreaming={streamState.isThinkingStreaming}
              senderName={streamState.agentName}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Agent chip selector + Input */}
        <div className="px-4 pb-4 flex-shrink-0 space-y-2">
          {/* Agent chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {workspaceAgents.map((agent) => {
              const selected = selectedAgentIds.includes(agent.id)
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                    selected
                      ? 'bg-[hsl(200_85%_55%)]/15 border-[hsl(200_85%_55%)]/40 text-[hsl(200_85%_65%)]'
                      : 'bg-[hsl(208_25%_12%)] border-[hsl(208_25%_16%)] text-[hsl(210_8%_65%)] hover:border-[hsl(200_85%_55%)]/20 hover:text-[hsl(210_13%_95%)]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-[hsl(200_85%_55%)]' : 'bg-[hsl(210_6%_40%)]'}`} />
                  {agent.name}
                </button>
              )
            })}
          </div>

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
          )}

          {/* Input bar */}
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

            {/* Text input */}
            <input
              className="flex-1 rounded-lg bg-[hsl(208_25%_12%)] border border-[hsl(208_25%_16%)] text-[hsl(210_13%_95%)] text-[0.875rem] px-4 py-[0.65rem] pr-10 outline-none transition-colors placeholder:text-[hsl(210_6%_40%)] focus:border-[hsl(200_85%_55%)]/50 disabled:opacity-50"
              placeholder={
                isStreaming
                  ? 'Waiting for response...'
                  : isUploading
                    ? 'Uploading file...'
                    : selectedAgentIds.length === 0
                      ? 'Select an agent to message...'
                      : `Message ${selectedAgentIds.length === 1 ? workspaceAgents.find((a) => a.id === selectedAgentIds[0])?.name : `${selectedAgentIds.length} agents`}...`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isStreaming && !isUploading && selectedAgentIds.length > 0) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isStreaming || isUploading || selectedAgentIds.length === 0}
            />

            {/* Send / Cancel button */}
            <button
              onClick={isStreaming ? streamingCancel : handleSend}
              disabled={!isStreaming && (selectedAgentIds.length === 0 || !input.trim() || isUploading)}
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
        <ArtifactPanel mode="workspace" workspaceId={workspaceId} hostId={hostId} filePath={openFilePath} />
      ) : null}

      {/* Workspace explorer sidebar */}
      <aside className={`workspace-rail relative flex min-h-56 w-full shrink-0 flex-col border-l border-discord-border-subtle bg-discord-bg shadow-[inset_1px_0_0_hsl(200_85%_55%/18%),-18px_0_48px_-24px_rgb(0_0_0/0.52)] ${
        openFilePath ? 'md:min-h-0 md:w-56 xl:w-64' : 'md:min-h-0 md:w-80 xl:w-[22rem]'
      }`}>
        <WorkspaceExplorer workspaceId={workspaceId} hostId={hostId} openFilePath={openFilePath} onDeleteFile={(nodeId) => {
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

// ── Sub-components ────────────────────────────────────────────────────────

function WorkspaceMessageBubble({
  msg,
  agents,
  isLast,
  isLoading,
}: {
  msg: WorkspaceMessage
  agents: AgentInfo[]
  isLast: boolean
  isLoading?: boolean
}) {
  const isUser = msg.senderType === 'user'
  const agent = !isUser && msg.senderId ? agents.find((a) => a.id === msg.senderId) : null
  const senderName = isUser ? 'You' : agent?.name ?? 'Agent'
  const time = formatTime(msg.timestamp)

  // For agent messages, parse reasoning
  const segments = !isUser ? parseReasoning(msg.content) : null
  const hasReasoning = segments?.some((s) => s.type === 'reasoning') ?? false
  const hasAttachments = isUser && msg.attachments && msg.attachments.length > 0

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up ${isLast ? 'mb-1' : ''}`}
    >
      <div className={`max-w-[65%] flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-[hsl(200_85%_55%)]/20 border border-[hsl(200_85%_55%)]/30 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-[hsl(200_85%_55%)]">
              {senderName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div>
          {/* Sender label for agent messages */}
          {!isUser && (
            <div className="text-[10px] font-semibold text-[hsl(200_85%_55%)] mb-0.5 ml-0.5">
              {senderName}
            </div>
          )}
          {!isUser && hasReasoning && segments && (
            <ReasoningSegments segments={segments} isLoading={isLoading ?? false} />
          )}
          {isUser && (
            <div className={`msg-content msg-user relative ${isLoading ? 'opacity-60' : ''}`}>
              {msg.content}
              {hasAttachments && msg.attachments && (
                <WorkspaceMessageAttachments attachments={msg.attachments} />
              )}
            </div>
          )}
          {!isUser && !hasReasoning && (
            <div className={`msg-content msg-assistant relative ${isLoading ? 'opacity-60' : ''}`}>
              {msg.content}
            </div>
          )}
          <div className={`text-[10px] text-[hsl(210_6%_40%)] mt-1 ${isUser ? 'text-right' : ''}`}>
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
            ? <div key={i} className={`msg-content msg-assistant relative ${isLoading ? 'opacity-60' : ''}`}>
                {seg.content}
              </div>
            : null
      ))}
    </>
  )
}

function ReasoningBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-[11px] text-[hsl(210_8%_50%)] hover:text-[hsl(200_85%_55%)] transition-colors cursor-pointer bg-[hsl(208_25%_10%)] border border-[hsl(208_25%_14%)] rounded-md px-2.5 py-1.5 w-full"
      >
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
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

function WorkspaceAgentTypingIndicator({ agentName }: { agentName: string }) {
  return (
    <div className="flex justify-start animate-fade-up" data-agent-typing={agentName}>
      <div className="flex items-end gap-2">
        <div className="w-7 h-7 rounded-full bg-[hsl(200_85%_55%)]/20 border border-[hsl(200_85%_55%)]/30 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-[hsl(200_85%_55%)]">
            {agentName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-[hsl(200_85%_55%)] mb-0.5 ml-0.5">
            {agentName}
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
    </div>
  )
}

function WorkspaceMessageAttachments({ attachments }: { attachments: Array<{ name: string; path: string; size: number }> }) {
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
