import { useEffect, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import { RefreshCw } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useWorkspaceFolderTree } from '#/hooks/useWorkspaceFile'
import { ExplorerRow } from '#/components/ExplorerRow'
import type { AgentFolderNode } from '#/lib/types'

interface WorkspaceExplorerProps {
  workspaceId: string
  hostId: string
  /** Currently-open workspace-relative file path (from URL search). */
  openFilePath?: string
  /** Called when user confirms deletion of a file. */
  onDeleteFile?: (nodeId: string, fileName: string) => void
}

/**
 * Workspace file explorer — loads folder tree for a workspace via react-query
 * and renders it with react-arborist. Clicking a file sets the `file` URL
 * search param so the ArtifactPanel opens.
 */
export function WorkspaceExplorer({ workspaceId, hostId, openFilePath, onDeleteFile }: WorkspaceExplorerProps) {
  const { data, isPending, isError, error, refetch, isFetching } = useWorkspaceFolderTree(workspaceId, hostId)
  const shellRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 320, height: 280 })
  const navigate = useNavigate()

  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    function measure() {
      const cr = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const w = Math.max(160, Math.floor(cr.width - (Number.isNaN(padX) ? 0 : padX)))
      const h = Math.max(160, Math.floor(cr.height - (Number.isNaN(padY) ? 0 : padY)))
      setSize({ width: w, height: h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function handleFileClick(nodeId: string) {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        file: prev.file === nodeId ? undefined : nodeId,
      }),
    })
  }

  return (
    <div className="workspace-explorer-root relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="workspace-explorer-ambient pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative z-10 shrink-0 border-b border-discord-border-subtle px-4 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[0.6rem] font-medium uppercase tracking-[0.22em] text-[hsl(210_8%_55%)]">
              Workspace files
            </p>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-8 w-[3px] shrink-0 rounded-full bg-linear-to-b from-[hsl(200_85%_65%)] via-[hsl(200_85%_52%)] to-[hsl(200_72%_38%)] shadow-[0_0_14px_hsl(200_85%_55%/0.35)]"
              />
              <h2
                className="text-[1.05rem] font-semibold leading-none tracking-tight text-discord-text"
                style={{ fontFamily: 'var(--font-workspace-display)' }}
              >
                Files
              </h2>
            </div>
          </div>
          <button
            type="button"
            title="Refresh file list"
            aria-label="Refresh workspace file list"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="relative mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-discord-border bg-discord-input text-discord-primary shadow-[inset_0_1px_0_hsl(200_85%_55%/10%)] transition-[background-color,color,transform,box-shadow,border-color] hover:border-[hsl(200_85%_55%/35%)] hover:bg-[hsl(200_85%_45%/12%)] hover:text-discord-primary-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
          >
            <RefreshCw
              aria-hidden
              className={`h-4 w-4 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
              strokeWidth={2}
            />
          </button>
        </div>
      </header>

      <div ref={shellRef} className="relative z-10 min-h-48 min-w-0 flex-1 px-4 pb-4 pt-3">
        {isPending && (
          <div className="space-y-3" aria-busy aria-label="Loading workspace files">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={String(i)}
                className="workspace-explorer-skeleton-line"
                style={{ marginLeft: (i % 4) * 12 + (i >= 5 ? 8 : 0) }}
              />
            ))}
          </div>
        )}
        {isError && (
          <div className="mx-4 mt-2 border border-discord-red/40 bg-discord-red/10 px-4 py-3 text-[0.8rem] leading-relaxed text-discord-red">
            {(error as Error).message ?? 'Could not load workspace'}
          </div>
        )}
        {!isPending && !isError && data?.tree && (
          <Tree<AgentFolderNode>
            data={[data.tree]}
            width={size.width}
            height={size.height}
            indent={18}
            rowHeight={31}
            openByDefault
            disableDrag
            disableDrop
            disableEdit
            className="workspace-explorer-tree font-mono text-discord-text"
          >
            {(props) => (
              <ExplorerRow
                {...props}
                selectedFilePath={openFilePath}
                onFileClick={handleFileClick}
                onDeleteFile={onDeleteFile}
              />
            )}
          </Tree>
        )}
      </div>
    </div>
  )
}
