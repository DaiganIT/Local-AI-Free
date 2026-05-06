import { File } from 'lucide-react'
import type { AgentFolderNode } from '#/lib/types'

interface FileMentionPopoverProps {
  files: AgentFolderNode[]
  query: string
  selectedIndex: number
  onSelect: (file: AgentFolderNode) => void
  onClose: () => void
}

/**
 * Stateless popover that displays a filtered list of files for `@`-mention.
 * Positioning is handled by the parent via absolute placement above the input.
 */
export function FileMentionPopover({ files, query, selectedIndex, onSelect }: FileMentionPopoverProps) {
  const filtered = query
    ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : files

  return (
    <div
      className="absolute bottom-full left-0 mb-1 w-72 rounded-lg border border-[hsl(208_25%_16%)] bg-[hsl(208_25%_11%)] shadow-lg overflow-hidden z-50"
      role="listbox"
      aria-label="File mentions"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2.5 text-xs text-[hsl(210_6%_45%)]">No recent files</div>
      ) : (
        filtered.map((file, i) => (
          <button
            key={file.id}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              // Prevent input blur before we process the selection
              e.preventDefault()
              onSelect(file)
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              i === selectedIndex
                ? 'bg-[hsl(200_85%_55%)]/15 text-[hsl(210_13%_95%)]'
                : 'text-[hsl(210_8%_75%)] hover:bg-[hsl(208_25%_14%)]'
            }`}
          >
            <File className="w-3.5 h-3.5 shrink-0 text-[hsl(200_85%_55%)]" />
            <span className="truncate">{file.name}</span>
          </button>
        ))
      )}
    </div>
  )
}
