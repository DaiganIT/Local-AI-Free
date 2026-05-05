import { useWorkspaces, useWorkspaceAgents, useAgents, useCreateWorkspaceChat, useWorkspaceChats } from '#/hooks'
import { FolderOpen, Folder, Bot, Clock, MessageSquarePlus, MessageSquare } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { nav } from '#/lib/navigation'

interface WorkspaceViewProps {
  workspaceId: string
  hostId: string
}

export function WorkspaceView({ workspaceId, hostId }: WorkspaceViewProps) {
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces(hostId)
  const { data: agentIds, isLoading: agentsLoading } = useWorkspaceAgents(workspaceId, hostId)
  const { data: agents } = useAgents()
  const { data: workspaceChats } = useWorkspaceChats(workspaceId, hostId)
  const createChat = useCreateWorkspaceChat()
  const navigate = useNavigate()

  const workspace = workspaces?.find((w) => w.id === workspaceId)

  if (wsLoading || agentsLoading || !workspace) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-sm text-[hsl(210_8%_65%)]">Loading workspace...</div>
      </div>
    )
  }

  const workspaceAgents = (agentIds ?? [])
    .map((id) => agents?.find((a) => a.id === id))
    .filter(Boolean)

  const createdDate = new Date(workspace.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <header className="h-12 px-4 flex items-center border-b border-[hsl(208_25%_8%)] bg-[hsl(208_25%_11%)] shadow-sm flex-shrink-0">
        <FolderOpen className="w-5 h-5 text-[hsl(200_85%_55%)] mr-2" />
        <span className="font-semibold text-[hsl(210_13%_95%)]">
          {workspace.name}
        </span>
        <span className="ml-2 text-xs font-mono text-[hsl(210_6%_40%)]">
          {workspace.alias}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Details */}
        <section>
          <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider mb-3">
            Details
          </h3>
          <div className="space-y-2">
            <InfoRow
              icon={<Folder className="w-3.5 h-3.5" />}
              label="Path"
              value={`.workspaces/${workspace.path}`}
            />
            <InfoRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Created"
              value={createdDate}
            />
          </div>
        </section>

        {/* Chats */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider">
              Chats ({workspaceChats?.length ?? 0})
            </h3>
            <button
              onClick={() => {
                createChat.mutate(
                  { workspaceId, hostId },
                  {
                    onSuccess: (chat) => {
                      navigate({ to: nav.workspaceChat(hostId, workspaceId, chat.id) })
                    },
                  },
                )
              }}
              disabled={createChat.isPending}
              className="flex items-center gap-1 text-xs text-[hsl(200_85%_55%)] hover:text-[hsl(200_85%_65%)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
          {(workspaceChats ?? []).length === 0 ? (
            <div className="text-xs text-[hsl(210_8%_65%)] bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5">
              No chats yet — start one to begin a conversation
            </div>
          ) : (
            <div className="space-y-1.5">
              {workspaceChats!.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => navigate({ to: nav.workspaceChat(hostId, workspaceId, chat.id) })}
                  className="w-full flex items-center justify-between bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5 hover:border-[hsl(200_85%_55%)]/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[hsl(210_8%_65%)]" />
                    <span className="text-sm font-medium text-[hsl(210_13%_95%)]">
                      {chat.title || 'Untitled'}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[hsl(210_8%_65%)]">
                    {chat.promptCount} msgs
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Agents */}
        <section>
          <h3 className="text-[10px] font-semibold text-[hsl(210_6%_40%)] uppercase tracking-wider mb-3">
            Agents ({workspaceAgents.length})
          </h3>
          {workspaceAgents.length === 0 ? (
            <div className="text-xs text-[hsl(210_8%_65%)] bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5">
              No agents in this workspace
            </div>
          ) : (
            <div className="space-y-1.5">
              {workspaceAgents.map((agent) => (
                <div
                  key={agent!.id}
                  className="flex items-center justify-between bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-[hsl(210_8%_65%)]" />
                    <span className="text-sm font-medium text-[hsl(210_13%_95%)]">
                      {agent!.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[hsl(210_8%_65%)]">
                    {agent!.model}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between bg-[hsl(208_25%_11%)] border border-[hsl(208_25%_14%)] rounded-md px-3 py-2.5">
      <div className="flex items-center gap-2 text-[hsl(210_8%_65%)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-medium text-[hsl(210_13%_95%)] font-mono">
        {value}
      </span>
    </div>
  )
}
