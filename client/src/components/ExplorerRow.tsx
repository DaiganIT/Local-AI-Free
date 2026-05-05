import { useState, useRef, useEffect } from 'react'
import type { NodeRendererProps } from 'react-arborist'
import { File, Folder, Trash2 } from 'lucide-react'
import type { AgentFolderNode } from '#/lib/types'

/** Files that cannot be deleted — they contain the system prompt. */
const PROTECTED_FILE_NAMES = new Set(['AGENTS.md'])

export interface ExplorerRowProps extends NodeRendererProps<AgentFolderNode> {
  selectedFilePath?: string
  onFileClick: (nodeId: string) => void
  /** Called when user confirms deletion of a file. Only invoked for files (not directories). */
  onDeleteFile?: (nodeId: string, fileName: string) => void
}

export function ExplorerRow({ node, style, dragHandle, selectedFilePath, onFileClick, onDeleteFile }: ExplorerRowProps) {
  const isDir = node.data.kind === 'directory'
  const isSelected = !isDir && node.data.id === selectedFilePath
  const Icon = isDir ? Folder : File

  const [showConfirm, setShowConfirm] = useState(false)
  const confirmRef = useRef<HTMLDivElement>(null)

  // Close confirm popover on outside click
  useEffect(() => {
    if (!showConfirm) return
    function handleClick(e: MouseEvent) {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setShowConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showConfirm])

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    setShowConfirm(true)
  }

  function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setShowConfirm(false)
    onDeleteFile?.(node.data.id, node.data.name)
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setShowConfirm(false)
  }

  return (
    <div
      style={style}
      ref={dragHandle}
      onClick={() => {
        if (!isDir) onFileClick(node.data.id)
      }}
      className={`workspace-explorer-row group relative flex cursor-default items-center gap-1.5 overflow-hidden px-1 py-0.5 outline-none hover:bg-discord-surface-hover hover:shadow-[inset_3px_0_0_hsl(200_85%_55%/0.75)] focus-visible:bg-discord-surface-hover focus-visible:ring-2 focus-visible:ring-[hsl(200_85%_55%/0.35)] ${
        isSelected
          ? 'bg-[hsl(200_85%_45%/15%)] shadow-[inset_3px_0_0_hsl(200_85%_55%)]'
          : ''
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none ${
          isDir
            ? 'text-discord-primary drop-shadow-[0_0_8px_hsl(200_85%_55%/0.28)]'
            : isSelected
              ? 'text-discord-primary'
              : 'text-discord-channel-icon group-hover:text-discord-primary'
        }`}
        strokeWidth={isDir ? 2 : 1.75}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[0.78rem] ${
          isDir
            ? 'font-medium text-discord-text'
            : isSelected
              ? 'font-medium text-discord-primary'
              : 'font-normal text-[hsl(210_13%_85%)]'
        }`}
      >
        {node.data.name}
      </span>

      {/* Delete button — files only, not for protected files, appears on hover */}
      {!isDir && onDeleteFile && !PROTECTED_FILE_NAMES.has(node.data.name) && (
        <button
          type="button"
          title="Delete file"
          aria-label={`Delete ${node.data.name}`}
          onClick={handleDeleteClick}
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-[hsl(210_8%_55%)] opacity-0 transition-all group-hover:opacity-100 hover:text-discord-red hover:bg-discord-red/10"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
        </button>
      )}

      {/* Confirmation popover */}
      {showConfirm && (
        <div
          ref={confirmRef}
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-discord-border bg-discord-surface p-2 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 px-1 text-xs text-discord-text">
            Delete <span className="font-mono font-semibold text-discord-red">{node.data.name}</span>?
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCancelDelete}
              className="flex-1 rounded-md border border-discord-border bg-discord-input px-2 py-1 text-xs font-medium text-discord-text transition-colors hover:bg-discord-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="flex-1 rounded-md bg-discord-red/90 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-discord-red"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
