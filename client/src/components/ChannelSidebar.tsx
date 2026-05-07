import { useState } from 'react'
import type { AgentInfo, Chat, WorkspaceChat } from '#/lib/types'
import { useAgents, useChats, useHosts, useCreateChat, useWorkspaces, useWorkspaceChats, useCreateWorkspaceChat, useWorkspaceChatDetail } from '#/hooks'
import { useChatDetail } from '#/hooks/useChatDetail'
import { Computer, FolderOpen, HashIcon, Plus, MessageSquare } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

export type ChannelKind =
  | { kind: 'agent'; id: string; hostId: string }
  | { kind: 'chat'; chatId: string; agentId: string; hostId: string }
  | { kind: 'host-info'; hostId: string }
  | { kind: 'recent-activity' }
  | { kind: 'workspace'; id: string; hostId: string }
  | { kind: 'workspace-chat'; chatId: string; workspaceId: string; hostId: string }

interface ChannelSidebarProps {
  selectedHostId: string | null
  selection: ChannelKind | null
  onSelect: (sel: ChannelKind | null) => void
}

export function ChannelSidebar({
  selectedHostId,
  selection,
  onSelect,
}: ChannelSidebarProps) {
  const navigate = useNavigate()
  const { data: hosts } = useHosts()
  const { data: agents } = useAgents()
  const selectedHost = hosts?.find((h) => h.id === selectedHostId)
  const isHome = selectedHostId === null

  return (
    <div className="w-60 bg-[hsl(208_25%_11%)] flex flex-col border-r border-[hsl(208_25%_8%)] flex-shrink-0">
      {/* Header */}
      <div className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] shadow-sm">
        <h2 className="text-[0.9375rem] font-semibold text-[hsl(210_13%_95%)] truncate">
          {isHome ? 'All Hosts' : selectedHost?.hostname}
        </h2>
      </div>

      {/* Channels / Agents list */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Create Agent button */}
        <button
          onClick={() => navigate({ to: '/create-agent' })}
          className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[hsl(210_8%_65%)] hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(200_85%_55%)] transition-colors cursor-pointer group"
        >
          <Plus className="w-4 h-4 text-[hsl(210_8%_50%)] group-hover:text-[hsl(200_85%_55%)] transition-colors" />
          <span className="text-[0.875rem] truncate group-hover:text-[hsl(200_85%_55%)] transition-colors">
            Create Agent
          </span>
        </button>

        {/* Create Workspace button */}
        {!isHome && (
          <button
            onClick={() => navigate({ to: '/create-workspace' })}
            className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md text-[hsl(210_8%_65%)] hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(200_85%_55%)] transition-colors cursor-pointer group"
          >
            <Plus className="w-4 h-4 text-[hsl(210_8%_50%)] group-hover:text-[hsl(200_85%_55%)] transition-colors" />
            <span className="text-[0.875rem] truncate group-hover:text-[hsl(200_85%_55%)] transition-colors">
              Create Workspace
            </span>
          </button>
        )}

        {isHome ? (
          <HomeChannels selection={selection} onSelect={onSelect} />
        ) : selectedHost ? (
          <HostChannels
            hostId={selectedHost.id}
            agents={agents ?? []}
            selection={selection}
            onSelect={onSelect}
          />
        ) : null}
      </div>

      {/* User panel (bottom) */}
      <div className="h-[52px] bg-[hsl(208_25%_8%)] px-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-[hsl(200_85%_55%)] flex items-center justify-center text-white text-sm font-semibold">
          P
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[hsl(210_13%_95%)] truncate">
            Pietro
          </div>
          <div className="text-[10px] text-[hsl(210_8%_65%)] truncate">
            Online
          </div>
        </div>
      </div>
    </div>
  )
}

function HomeChannels({
  selection,
  onSelect,
}: {
  selection: ChannelKind | null
  onSelect: (sel: ChannelKind | null) => void
}) {
  return (
    <>
      <div className="px-1 mb-3">
        <CategoryLabel label="General" />
        <ChannelButton
          icon={<HashIcon className="w-4 h-4" />}
          label="Welcome"
          active={selection === null}
          onClick={() => onSelect(null)}
        />
        <ChannelButton
          icon={<HashIcon className="w-4 h-4" />}
          label="Recent Activity"
          active={selection?.kind === 'recent-activity'}
          onClick={() =>
            onSelect(
              isMatch(selection, { kind: 'recent-activity' })
                ? null
                : { kind: 'recent-activity' },
            )
          }
        />
      </div>

      <div className="px-1 mt-4">
        <CategoryLabel label="Quick Chat" />
        <ChannelButton
          icon={<HashIcon className="w-4 h-4" />}
          label="General Chat"
          active={selection?.kind === 'agent' && selection.id === 'agent-1' && selection.hostId === ''}
          onClick={() =>
            onSelect(
              isMatch(selection, { kind: 'agent', id: 'agent-1', hostId: '' })
                ? null
                : { kind: 'agent', id: 'agent-1', hostId: '' },
            )
          }
        />
      </div>
    </>
  )
}

function HostChannels({
  hostId,
  agents,
  selection,
  onSelect,
}: {
  hostId: string
  agents: AgentInfo[]
  selection: ChannelKind | null
  onSelect: (sel: ChannelKind | null) => void
}) {
  const activeAgentId = getActiveAgentId(selection)
  const onlineAgents = agents.filter(
    (a) => a.hostId === hostId && a.providerOnline === true,
  )
  const otherAgents = agents.filter(
    (a) => a.hostId === hostId && a.providerOnline !== true,
  )
  const { data: workspaces } = useWorkspaces(hostId)

  return (
    <>
      <div className="px-1 mb-3">
        <CategoryLabel label="Info" />
        <ChannelButton
          icon={<Computer className="w-4 h-4" />}
          label="host-info"
          active={
            selection?.kind === 'host-info' && selection.hostId === hostId
          }
          onClick={() =>
            onSelect(
              isMatch(selection, { kind: 'host-info', hostId })
                ? null
                : { kind: 'host-info', hostId },
            )
          }
        />
      </div>

      {onlineAgents.length > 0 && (
        <div className="px-1 mt-4">
          <CategoryLabel label="Online Agents" />
          {onlineAgents.map((agent) => (
            <AgentWithChats
              key={agent.id}
              agent={agent}
              hostId={hostId}
              activeAgentId={activeAgentId}
              activeChatId={selection?.kind === 'chat' ? selection.chatId : null}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {otherAgents.length > 0 && (
        <div className="px-1 mt-4">
          <CategoryLabel label="Other Agents" />
          {otherAgents.map((agent) => (
            <AgentWithChats
              key={agent.id}
              agent={agent}
              hostId={hostId}
              activeAgentId={activeAgentId}
              activeChatId={selection?.kind === 'chat' ? selection.chatId : null}
              selection={selection}
              onSelect={onSelect}
              muted={agent.providerOnline === false}
            />
          ))}
        </div>
      )}

      {workspaces && workspaces.length > 0 && (
        <div className="px-1 mt-4">
          <CategoryLabel label="Workspaces" />
          {workspaces.map((ws) => (
            <WorkspaceWithChats
              key={ws.id}
              workspace={ws}
              hostId={hostId}
              activeWorkspaceId={getActiveWorkspaceId(selection)}
              activeChatId={selection?.kind === 'workspace-chat' ? selection.chatId : null}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </>
  )
}

function getActiveAgentId(selection: ChannelKind | null): string | null {
  if (!selection) return null
  if (selection.kind === 'agent') return selection.id
  if (selection.kind === 'chat') return selection.agentId
  return null
}

function getActiveWorkspaceId(selection: ChannelKind | null): string | null {
  if (!selection) return null
  if (selection.kind === 'workspace') return selection.id
  if (selection.kind === 'workspace-chat') return selection.workspaceId
  return null
}

function AgentWithChats({
  agent,
  hostId,
  activeAgentId,
  activeChatId,
  selection,
  onSelect,
  muted = false,
}: {
  agent: AgentInfo
  hostId: string
  activeAgentId: string | null
  activeChatId: string | null
  selection: ChannelKind | null
  onSelect: (sel: ChannelKind | null) => void
  muted?: boolean
}) {
  const isFocused = activeAgentId === agent.id
  const { data: chats } = useChats(isFocused ? agent.id : '')
  const createChatMutation = useCreateChat()
  const [creatingChat, setCreatingChat] = useState(false)

  const handleSelectAgent = () => {
    onSelect(
      isMatch(selection, { kind: 'agent', id: agent.id, hostId })
        ? null
        : { kind: 'agent', id: agent.id, hostId },
    )
  }

  const handleNewChat = () => {
    setCreatingChat(true)
    createChatMutation.mutate(
      { agentId: agent.id },
      {
        onSuccess: (chat) => {
          onSelect({ kind: 'chat', chatId: chat.id, agentId: agent.id, hostId })
          setCreatingChat(false)
        },
        onError: () => setCreatingChat(false),
      },
    )
  }

  const statusIcon = muted
    ? <span className="w-2.5 h-2.5 rounded-full bg-[hsl(0_56%_48%)]" />
    : (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(153_46%_49%)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(153_46%_49%)]" />
      </span>
    )

  return (
    <div className="mb-1">
      <ChannelButton
        icon={statusIcon}
        label={agent.name}
        active={selection?.kind === 'agent' && selection.id === agent.id}
        muted={muted}
        onClick={handleSelectAgent}
      />

      {/* Chat list for the focused agent */}
      {isFocused && chats && chats.length > 0 && (
        <div className="ml-4 mt-1 space-y-0.5">
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              hostId={hostId}
              agentId={agent.id}
              isActive={activeChatId === chat.id}
              onSelect={onSelect}
            />
          ))}
          <button
            onClick={handleNewChat}
            disabled={creatingChat}
            className="w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[hsl(210_6%_40%)] hover:text-[hsl(200_85%_55%)] hover:bg-[hsl(208_25%_14%)] transition-colors text-xs disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            <span className="truncate">New conversation</span>
          </button>
        </div>
      )}

      {isFocused && (!chats || chats.length === 0) && (
        <div className="ml-4 mt-1">
          <button
            onClick={handleNewChat}
            disabled={creatingChat}
            className="w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[hsl(210_6%_40%)] hover:text-[hsl(200_85%_55%)] hover:bg-[hsl(208_25%_14%)] transition-colors text-xs disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            <span className="truncate">New conversation</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ChatRow({
  chat,
  hostId,
  agentId,
  isActive,
  onSelect,
}: {
  chat: Chat
  hostId: string
  agentId: string
  isActive: boolean
  onSelect: (sel: ChannelKind) => void
}) {
  return (
    <button
      onClick={() => onSelect({ kind: 'chat', chatId: chat.id, agentId, hostId })}
      className={`w-full flex items-center justify-between px-2 py-[5px] rounded-md transition-colors cursor-pointer group
        ${
          isActive
            ? 'bg-[hsl(208_25%_18%)] text-[hsl(210_13%_95%)]'
            : 'text-[hsl(210_8%_65%)] hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(210_13%_95%)]'
        }
      `}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <MessageSquare className="w-3.5 h-3.5 text-[hsl(210_8%_50%)] group-hover:text-[hsl(210_8%_65%)] flex-shrink-0" />
        <span className="text-[0.875rem] truncate">{chat.title || 'Untitled'}</span>
      </div>
      <ContextUsageLabel chatId={chat.id} />
    </button>
  )
}

function WorkspaceWithChats({
  workspace,
  hostId,
  activeWorkspaceId,
  activeChatId,
  selection,
  onSelect,
}: {
  workspace: { id: string; name: string; hostId: string }
  hostId: string
  activeWorkspaceId: string | null
  activeChatId: string | null
  selection: ChannelKind | null
  onSelect: (sel: ChannelKind | null) => void
}) {
  const isFocused = activeWorkspaceId === workspace.id
  const { data: chats } = useWorkspaceChats(isFocused ? workspace.id : '', isFocused ? hostId : '')
  const createChatMutation = useCreateWorkspaceChat()
  const [creatingChat, setCreatingChat] = useState(false)

  const handleSelectWorkspace = () => {
    onSelect(
      isMatch(selection, { kind: 'workspace', id: workspace.id, hostId })
        ? null
        : { kind: 'workspace', id: workspace.id, hostId },
    )
  }

  const handleNewChat = () => {
    setCreatingChat(true)
    createChatMutation.mutate(
      { workspaceId: workspace.id, hostId },
      {
        onSuccess: (chat) => {
          onSelect({ kind: 'workspace-chat', chatId: chat.id, workspaceId: workspace.id, hostId })
          setCreatingChat(false)
        },
        onError: () => setCreatingChat(false),
      },
    )
  }

  return (
    <div className="mb-1">
      <ChannelButton
        icon={<FolderOpen className="w-4 h-4" />}
        label={workspace.name}
        active={selection?.kind === 'workspace' && selection.id === workspace.id}
        onClick={handleSelectWorkspace}
      />

      {/* Chat list for the focused workspace */}
      {isFocused && chats && chats.length > 0 && (
        <div className="ml-4 mt-1 space-y-0.5">
          {chats.map((chat) => (
            <WorkspaceChatRow
              key={chat.id}
              chat={chat}
              hostId={hostId}
              workspaceId={workspace.id}
              isActive={activeChatId === chat.id}
              onSelect={onSelect}
            />
          ))}
          <button
            onClick={handleNewChat}
            disabled={creatingChat}
            className="w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[hsl(210_6%_40%)] hover:text-[hsl(200_85%_55%)] hover:bg-[hsl(208_25%_14%)] transition-colors text-xs disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            <span className="truncate">New conversation</span>
          </button>
        </div>
      )}

      {isFocused && (!chats || chats.length === 0) && (
        <div className="ml-4 mt-1">
          <button
            onClick={handleNewChat}
            disabled={creatingChat}
            className="w-full flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[hsl(210_6%_40%)] hover:text-[hsl(200_85%_55%)] hover:bg-[hsl(208_25%_14%)] transition-colors text-xs disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            <span className="truncate">New conversation</span>
          </button>
        </div>
      )}
    </div>
  )
}

function WorkspaceChatRow({
  chat,
  hostId,
  workspaceId,
  isActive,
  onSelect,
}: {
  chat: WorkspaceChat
  hostId: string
  workspaceId: string
  isActive: boolean
  onSelect: (sel: ChannelKind) => void
}) {
  return (
    <button
      onClick={() => onSelect({ kind: 'workspace-chat', chatId: chat.id, workspaceId, hostId })}
      className={`w-full flex items-center justify-between px-2 py-[5px] rounded-md transition-colors cursor-pointer group
        ${
          isActive
            ? 'bg-[hsl(208_25%_18%)] text-[hsl(210_13%_95%)]'
            : 'text-[hsl(210_8%_65%)] hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(210_13%_95%)]'
        }
      `}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <MessageSquare className="w-3.5 h-3.5 text-[hsl(210_8%_50%)] group-hover:text-[hsl(210_8%_65%)] flex-shrink-0" />
        <span className="text-[0.875rem] truncate">{chat.title || 'Untitled'}</span>
      </div>
      <WorkspaceContextUsageLabel chatId={chat.id} />
    </button>
  )
}

function WorkspaceContextUsageLabel({ chatId }: { chatId: string }) {
  const { data: detail } = useWorkspaceChatDetail(chatId)
  if (!detail?.chat) return null
  const { promptCount } = detail.chat
  if (!promptCount) return null
  return (
    <span className="text-[10px] font-semibold text-[hsl(153_46%_49%)] tabular-nums ml-1.5 flex-shrink-0">
      {promptCount} msgs
    </span>
  )
}

function ContextUsageLabel({ chatId }: { chatId: string }) {
  const { data: detail } = useChatDetail(chatId)
  if (!detail?.contextLength || !detail?.contextUsed) return null
  const pct = Math.round((detail.contextUsed / detail.contextLength) * 100)
  return (
    <span className="text-[10px] font-semibold text-[hsl(153_46%_49%)] tabular-nums ml-1.5 flex-shrink-0">
      {pct}%
    </span>
  )
}

/** Helper: check if the current selection matches a candidate channel kind */
function isMatch(
  sel: ChannelKind | null | undefined,
  candidate: ChannelKind,
): boolean {
  if (!sel) return false
  if (sel.kind !== candidate.kind) return false
  if ('id' in candidate && 'id' in sel && sel.id !== candidate.id) return false
  if (
    'hostId' in candidate &&
    'hostId' in sel &&
    sel.hostId !== candidate.hostId
  )
    return false
  if (
    'chatId' in candidate &&
    'chatId' in sel &&
    sel.chatId !== candidate.chatId
  )
    return false
  if (
    'agentId' in candidate &&
    'agentId' in sel &&
    sel.agentId !== candidate.agentId
  )
    return false
  if (
    'workspaceId' in candidate &&
    'workspaceId' in sel &&
    sel.workspaceId !== candidate.workspaceId
  )
    return false
  return true
}

/* --- Sub-components --- */

function CategoryLabel({ label }: { label: string }) {
  return (
    <button className="flex items-center gap-0.5 px-1 py-1 mb-0.5 group cursor-pointer">
      <span className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider group-hover:text-[hsl(210_8%_65%)] transition-colors">
        {label}
      </span>
    </button>
  )
}

function ChannelButton({
  icon,
  label,
  active,
  muted = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-2 py-[5px] rounded-md transition-colors cursor-pointer group
        ${
          active
            ? 'bg-[hsl(208_25%_18%)] text-[hsl(210_13%_95%)]'
            : 'text-[hsl(210_8%_65%)] hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(210_13%_95%)]'
        }
        ${muted ? 'opacity-50 hover:opacity-80' : ''}
      `}
    >
      <span className="text-[hsl(210_8%_50%)] group-hover:text-[hsl(210_8%_65%)]">
        {icon}
      </span>
      <span
        className={`text-[0.875rem] truncate ${muted ? 'line-through decoration-[hsl(210_6%_40%)]' : ''}`}
      >
        {label}
      </span>
    </button>
  )
}
