import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useState, useCallback, useRef } from 'react'
import { ServerBar } from '#/components/ServerBar'
import { ChannelSidebar, type ChannelKind } from '#/components/ChannelSidebar'
import { parsePath } from '#/lib/navigation'

export const Route = createFileRoute('/_layout')({
  component: Layout,
})

function Layout() {
  const { pathname, searchStr } = useLocation()
  const navigate = useNavigate()
  const nav = parsePath(pathname + (searchStr ? `?${searchStr}` : ''))

  // When an artifact (file) is open, collapse the left chrome by default.
  // User can manually toggle it back open.
  const artifactOpen = !!nav.file
  const [chromeOverride, setChromeOverride] = useState<boolean | null>(null)

  // Reset override when artifact state changes
  const prevArtifactOpenRef = useRef(artifactOpen)
  if (artifactOpen !== prevArtifactOpenRef.current) {
    prevArtifactOpenRef.current = artifactOpen
    setChromeOverride(null)
  }

  const chromeCollapsed = artifactOpen ? (chromeOverride ?? true) : (chromeOverride ?? false)

  const selectedHostId =
    nav.kind === 'agent' || nav.kind === 'host-info' || nav.kind === 'chat' || nav.kind === 'workspace' || nav.kind === 'workspace-chat' ? nav.hostId! : null

  const selectionKind: ChannelKind | null =
    nav.kind === 'chat'
      ? { kind: 'chat' as const, chatId: nav.chatId!, agentId: nav.agentId!, hostId: nav.hostId! }
      : nav.kind === 'agent'
        ? { kind: 'agent' as const, id: nav.agentId!, hostId: nav.hostId! }
        : nav.kind === 'host-info'
          ? { kind: 'host-info' as const, hostId: nav.hostId! }
        : nav.kind === 'workspace'
          ? { kind: 'workspace' as const, id: nav.workspaceId!, hostId: nav.hostId! }
        : nav.kind === 'workspace-chat'
          ? { kind: 'workspace-chat' as const, chatId: nav.workspaceChatId!, workspaceId: nav.workspaceId!, hostId: nav.hostId! }
          : nav.kind === 'recent-activity'
            ? { kind: 'recent-activity' as const }
            : null

  const handleSelectHost = (hostId: string | null) => {
    const to = hostId === null ? '/' : `/hosts/${hostId}`
    navigate({ to })
  }

  const handleSelect = (
    sel: ChannelKind | null,
  ) => {
    let to: string
    if (sel === null) {
      to = selectedHostId ? `/hosts/${selectedHostId}` : '/'
    } else if (sel.kind === 'chat') {
      to = `/hosts/${selectedHostId}/a/${sel.agentId}/c/${sel.chatId}`
    } else if (sel.kind === 'agent') {
      to = `/hosts/${selectedHostId}/a/${sel.id}`
    } else if (sel.kind === 'host-info') {
      to = `/hosts/${sel.hostId}`
    } else if (sel.kind === 'workspace') {
      to = `/hosts/${sel.hostId}/w/${sel.id}`
    } else if (sel.kind === 'workspace-chat') {
      to = `/hosts/${sel.hostId}/w/${sel.workspaceId}/c/${sel.chatId}`
    } else {
      to = '/activity'
    }
    navigate({ to })
  }

  const toggleChrome = useCallback(() => {
    setChromeOverride(!chromeCollapsed)
  }, [chromeCollapsed])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[hsl(208_25%_8%)]">
      {!chromeCollapsed && (
        <ServerBar
          onSelectHost={handleSelectHost}
          selectedHostId={selectedHostId}
        />
      )}
      {!chromeCollapsed && (
        <ChannelSidebar
          selectedHostId={selectedHostId}
          selection={selectionKind}
          onSelect={handleSelect}
        />
      )}
      {/* Toggle button when chrome is collapsed */}
      {chromeCollapsed && (
        <button
          type="button"
          onClick={toggleChrome}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="absolute left-0 top-1/2 z-50 -translate-y-1/2 flex h-10 w-6 items-center justify-center rounded-r-md border border-l-0 border-[hsl(208_25%_16%)] bg-[hsl(208_25%_10%)] text-[hsl(210_8%_55%)] shadow-[2px_0_8px_rgb(0_0_0/0.3)] transition-colors hover:bg-[hsl(208_25%_14%)] hover:text-[hsl(210_13%_85%)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
