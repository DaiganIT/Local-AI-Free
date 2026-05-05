import { X, Loader2, Check, AlertCircle } from 'lucide-react'
import type { PendingAttachment } from '#/hooks'
import { formatBytes } from '#/lib/formatting'

/** Derive a short type badge label from mimeType or file extension. */
function getTypeBadge(mimeType?: string, fileName?: string): string {
  if (mimeType?.startsWith('image/')) return 'IMG'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX'
  if (mimeType?.startsWith('text/') && !mimeType.includes('plain')) return 'CODE'
  // Fallback to extension
  const ext = fileName?.split('.').pop()?.toLowerCase()
  if (!ext) return 'FILE'
  const codeExts = new Set(['py','js','ts','tsx','jsx','html','css','yaml','yml','xml','sql','sh','bat','json','csv','toml','rs','go','java','c','cpp','h','rb','php','swift','kt','r','lua','pl','md'])
  if (codeExts.has(ext)) return 'CODE'
  if (ext === 'txt' || ext === 'log' || ext === 'ini' || ext === 'cfg') return 'TXT'
  if (ext === 'pdf') return 'PDF'
  if (ext === 'docx') return 'DOCX'
  if (['png','jpg','jpeg','gif','webp','svg','bmp','ico'].includes(ext)) return 'IMG'
  return 'FILE'
}

const badgeColors: Record<string, string> = {
  IMG: 'bg-purple-500/20 text-purple-400',
  PDF: 'bg-red-500/20 text-red-400',
  DOCX: 'bg-blue-500/20 text-blue-400',
  CODE: 'bg-green-500/20 text-green-400',
  TXT: 'bg-yellow-500/20 text-yellow-400',
  FILE: 'bg-gray-500/20 text-gray-400',
}

interface AttachmentChipsProps {
  attachments: PendingAttachment[]
  onRemove: (id: string) => void
}

export function AttachmentChips({ attachments, onRemove }: AttachmentChipsProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((att) => (
        <div
          key={att.id}
          data-attachment-name={att.name}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            att.status === 'uploading'
              ? 'bg-[hsl(200_85%_55%)]/10 border-[hsl(200_85%_55%)]/25 text-[hsl(200_85%_75%)]'
              : att.status === 'done'
                ? 'bg-[hsl(153_46%_49%)]/10 border-[hsl(153_46%_49%)]/25 text-[hsl(153_46%_65%)]'
                : 'bg-[hsl(0_85%_55%)]/10 border-[hsl(0_85%_55%)]/25 text-[hsl(0_85%_75%)]'
          }`}
        >
          {/* Status icon */}
          {att.status === 'uploading' && (
            <Loader2 className="w-3 h-3 animate-spin" data-attachment-spinner />
          )}
          {att.status === 'done' && (
            <Check className="w-3 h-3" />
          )}
          {att.status === 'error' && (
            <span data-attachment-error title={att.error ?? 'Upload failed'}>
              <AlertCircle className="w-3 h-3" />
            </span>
          )}

          {/* Filename */}
          <span>{att.name}</span>

          {/* Type badge */}
          <span
            data-type-badge
            className={`text-[9px] font-bold px-1 py-px rounded ${badgeColors[getTypeBadge(att.mimeType, att.name)] ?? badgeColors.FILE}`}
          >
            {getTypeBadge(att.mimeType, att.name)}
          </span>

          {/* Size for completed uploads */}
          {att.status === 'done' && att.size != null && (
            <span className="text-[10px] opacity-60">{formatBytes(att.size)}</span>
          )}

          {/* Remove button */}
          <button
            onClick={() => onRemove(att.id)}
            aria-label={`Remove ${att.name}`}
            className="ml-0.5 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
