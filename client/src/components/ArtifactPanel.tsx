import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, FileText, Image, File, Trash2 } from 'lucide-react'
import { useWorkspaceFile, useSaveWorkspaceFile } from '#/hooks/useWorkspaceFile'
import { useAgentFile, useSaveAgentFile } from '#/hooks/useAgentFile'
import { useDeleteAgentFile, useDeleteWorkspaceFile } from '#/hooks/useDeleteFile'
import { MarkdownRenderer } from './renderers/MarkdownRenderer'
import { CsvRenderer } from './renderers/CsvRenderer'
import { TextRenderer } from './renderers/TextRenderer'

type ArtifactPanelProps =
  | { mode: 'agent'; agentId: string; hostId: string; filePath: string }
  | { mode: 'workspace'; workspaceId: string; hostId: string; filePath: string }

const UNSUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
])

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

type FileRenderType = 'markdown' | 'csv' | 'text' | 'unsupported'

function detectRenderType(ext: string): FileRenderType {
  if (UNSUPPORTED_EXTENSIONS.has(ext)) return 'unsupported'
  if (ext === '.md') return 'markdown'
  if (ext === '.csv') return 'csv'
  return 'text'
}

/**
 * Right-side artifact panel. Reads the file via the appropriate relay API
 * hook and delegates rendering to the matching renderer component.
 */
export function ArtifactPanel(props: ArtifactPanelProps) {
  const { filePath } = props
  const navigate = useNavigate()

  const fileQuery = props.mode === 'agent'
    ? useAgentFile(props.agentId, props.hostId, filePath)
    : useWorkspaceFile(props.workspaceId, props.hostId, filePath)

  const saveMutation = props.mode === 'agent'
    ? useSaveAgentFile(props.agentId, props.hostId)
    : useSaveWorkspaceFile(props.workspaceId, props.hostId)

  const deleteMutation = props.mode === 'agent'
    ? useDeleteAgentFile(props.agentId)
    : useDeleteWorkspaceFile(props.workspaceId, props.hostId)

  const { data, isPending, isError, error } = fileQuery
  const ext = fileExtension(filePath)
  const fileName = filePath.split('/').pop() ?? filePath
  const renderType = detectRenderType(ext)
  const isProtectedFile = fileName === 'AGENTS.md'

  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleClose() {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, file: undefined }) })
  }

  function handleConfirmDelete() {
    setConfirmDelete(false)
    deleteMutation.mutate({ path: filePath }, { onSuccess: handleClose })
  }

  return (
    <div className="artifact-panel relative flex min-w-0 flex-1 flex-col border-l border-discord-border-subtle bg-[hsl(208_25%_9%)] shadow-[-4px_0_24px_-8px_rgb(0_0_0/0.4)]">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-discord-border-subtle px-4 py-3">
        <FileKindIcon kind={data?.kind} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">
          {fileName}
        </span>
        <span className="shrink-0 font-mono text-[0.65rem] text-discord-text-muted">
          {filePath}
        </span>

        {!isProtectedFile && confirmDelete ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-discord-border bg-discord-input px-2 py-0.5 text-xs font-medium text-discord-text transition-colors hover:bg-discord-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="rounded-md bg-discord-red/90 px-2 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-discord-red disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ) : !isProtectedFile ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete file"
            title="Delete file"
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-text-dim transition-colors hover:bg-discord-red/10 hover:text-discord-red"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close artifact"
          title="Close artifact"
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isPending && (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-discord-primary border-t-transparent" />
              <p className="text-xs text-discord-text-dim">Loading file…</p>
            </div>
          </div>
        )}

        {isError && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-xl border border-discord-red/40 bg-discord-red/10 px-5 py-4 text-center">
              <p className="text-sm text-discord-red">
                {error instanceof Error ? error.message : 'Failed to load file'}
              </p>
            </div>
          </div>
        )}

        {data?.kind === 'image' && (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={data.content}
              alt={fileName}
              className="max-h-full max-w-full rounded-lg border border-discord-border shadow-lg"
            />
          </div>
        )}

        {data?.kind === 'text' && renderType === 'unsupported' && (
          <UnsupportedPlaceholder fileName={fileName} ext={ext} />
        )}

        {data?.kind === 'text' && renderType === 'markdown' && (
          <MarkdownRenderer
            initialContent={data.content}
            onSave={(content) => saveMutation.mutate({ path: filePath, content })}
            isSaving={saveMutation.isPending}
          />
        )}

        {data?.kind === 'text' && renderType === 'csv' && (
          <CsvRenderer
            content={data.content}
            onSave={(content) => saveMutation.mutate({ path: filePath, content })}
            isSaving={saveMutation.isPending}
          />
        )}

        {data?.kind === 'text' && renderType === 'text' && (
          <TextRenderer
            initialContent={data.content}
            onSave={(content) => saveMutation.mutate({ path: filePath, content })}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>
    </div>
  )
}

function UnsupportedPlaceholder({ fileName, ext }: { fileName: string; ext: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-discord-border bg-discord-surface px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-discord-surface-hover">
          <File className="h-6 w-6 text-discord-text-dim" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-discord-text">{fileName}</p>
        <p className="mt-1.5 text-xs text-discord-text-dim">
          Preview not available for <span className="font-mono">{ext}</span> files
        </p>
      </div>
    </div>
  )
}

function FileKindIcon({ kind }: { kind?: string }) {
  if (kind === 'image') return <Image className="h-4 w-4 text-discord-primary" strokeWidth={1.75} />
  if (kind === 'text') return <FileText className="h-4 w-4 text-discord-primary" strokeWidth={1.75} />
  return <File className="h-4 w-4 text-discord-text-dim" strokeWidth={1.75} />
}
