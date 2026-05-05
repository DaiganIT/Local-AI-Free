import { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, FileText, Image, File, Save, Trash2 } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useWorkspaceFile, useSaveWorkspaceFile } from '#/hooks/useWorkspaceFile'
import { useAgentFile, useSaveAgentFile } from '#/hooks/useAgentFile'
import { useDeleteAgentFile, useDeleteWorkspaceFile } from '#/hooks/useDeleteFile'

type ArtifactPanelProps =
  | { mode: 'agent'; agentId: string; hostId: string; filePath: string }
  | { mode: 'workspace'; workspaceId: string; hostId: string; filePath: string }

const UNSUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
])

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : ''
}

/**
 * Right-side artifact panel that displays a file from either an agent
 * workspace or a shared workspace. Reads the file via the appropriate
 * relay API hook and renders it based on kind. Uses TipTap for text
 * editing, <img> for images, placeholder for unsupported.
 */
export function ArtifactPanel(props: ArtifactPanelProps) {
  const { filePath } = props
  const navigate = useNavigate()

  // Select the right hooks based on mode
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
  const isMarkdown = ext === '.md'
  const isUnsupported = UNSUPPORTED_EXTENSIONS.has(ext)

  function handleClose() {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, file: undefined }) })
  }

  const [confirmDelete, setConfirmDelete] = useState(false)

  const isProtectedFile = fileName === 'AGENTS.md'

  function handleDeleteClick() {
    setConfirmDelete(true)
  }

  function handleConfirmDelete() {
    setConfirmDelete(false)
    deleteMutation.mutate({ path: filePath }, {
      onSuccess: () => {
        handleClose()
      },
    })
  }

  function handleCancelDelete() {
    setConfirmDelete(false)
  }

  return (
    <div className="artifact-panel relative flex min-w-0 flex-1 flex-col border-l border-[hsl(208_25%_14%)] bg-[hsl(208_25%_9%)] shadow-[-4px_0_24px_-8px_rgb(0_0_0/0.4)]">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[hsl(208_25%_14%)] px-4 py-3">
        <FileKindIcon kind={data?.kind} fileName={fileName} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[hsl(210_13%_95%)]">
          {fileName}
        </span>
        <span className="shrink-0 text-[0.65rem] font-mono text-[hsl(210_6%_40%)]">
          {filePath}
        </span>
        {/* Delete button — hidden for protected files like AGENTS.md */}
        {!isProtectedFile && confirmDelete ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCancelDelete}
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
            onClick={handleDeleteClick}
            aria-label="Delete file"
            title="Delete file"
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(210_8%_55%)] transition-colors hover:bg-discord-red/10 hover:text-discord-red"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close artifact"
          title="Close artifact"
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(210_8%_55%)] transition-colors hover:bg-[hsl(208_25%_16%)] hover:text-[hsl(210_13%_85%)]"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isPending && (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[hsl(200_85%_45%)] border-t-transparent" />
              <p className="text-xs text-[hsl(210_8%_55%)]">Loading file…</p>
            </div>
          </div>
        )}

        {isError && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-xl border border-discord-red/40 bg-discord-red/10 px-5 py-4 text-center">
              <p className="text-sm text-discord-red">
                {(error as Error)?.message ?? 'Failed to load file'}
              </p>
            </div>
          </div>
        )}

        {data && data.kind === 'image' && (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={data.content}
              alt={fileName}
              className="max-h-full max-w-full rounded-lg border border-[hsl(208_25%_16%)] shadow-lg"
            />
          </div>
        )}

        {data && data.kind === 'text' && isUnsupported && (
          <UnsupportedPlaceholder fileName={fileName} ext={ext} />
        )}

        {data && data.kind === 'text' && !isUnsupported && (
          <TextEditor
            initialContent={data.content}
            isMarkdown={isMarkdown}
            onSave={(content) => saveMutation.mutate({ path: filePath, content })}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>
    </div>
  )
}

/**
 * TipTap-based text editor for workspace files.
 * For .md files: renders rich markdown with editable content.
 * For other text files: plain text editor.
 */
function TextEditor({
  initialContent,
  isMarkdown,
  onSave,
  isSaving,
}: {
  initialContent: string
  isMarkdown: boolean
  onSave: (content: string) => void
  isSaving: boolean
}) {
  const [isDirty, setIsDirty] = useState(false)
  const initialContentRef = useRef(initialContent)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Empty file',
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'artifact-editor outline-none h-full',
      },
    },
    onUpdate: ({ editor }) => {
      const current = isMarkdown ? editor.getHTML() : editor.getText()
      setIsDirty(current !== initialContentRef.current)
    },
  })

  // Reset dirty state when initial content changes (e.g., after save refetch)
  useEffect(() => {
    initialContentRef.current = initialContent
    setIsDirty(false)
  }, [initialContent])

  const handleSave = useCallback(() => {
    if (!editor || isSaving) return
    const content = isMarkdown ? editor.getHTML() : editor.getText()
    onSave(content)
  }, [editor, isMarkdown, onSave, isSaving])

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <div className="flex h-full flex-col">
      {/* Save bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[hsl(208_25%_12%)] px-4 py-1.5">
        {isDirty && (
          <span className="text-[0.65rem] text-[hsl(200_85%_55%)] animate-pulse">● Modified</span>
        )}
        {!isDirty && <span />}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="flex items-center gap-1.5 rounded-md bg-[hsl(200_85%_45%/15%)] px-3 py-1 text-xs font-medium text-[hsl(200_85%_65%)] border border-[hsl(200_85%_45%/25%)] transition-colors hover:bg-[hsl(200_85%_45%/25%)] disabled:opacity-40 disabled:cursor-default"
        >
          <Save className="h-3 w-3" strokeWidth={2} />
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <EditorContent editor={editor} />
      </div>

      {/* TipTap prose styling */}
      <style>{`
        .artifact-editor .ProseMirror {
          min-height: 100%;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 0.82rem;
          line-height: 1.7;
          color: hsl(210 13% 85%);
        }
        .artifact-editor .ProseMirror h1 { font-size: 1.5rem; font-weight: 700; color: hsl(210 13% 95%); margin: 1rem 0 0.5rem; }
        .artifact-editor .ProseMirror h2 { font-size: 1.25rem; font-weight: 600; color: hsl(210 13% 95%); margin: 0.75rem 0 0.375rem; }
        .artifact-editor .ProseMirror h3 { font-size: 1rem; font-weight: 600; color: hsl(210 13% 90%); margin: 0.5rem 0 0.25rem; }
        .artifact-editor .ProseMirror p { margin: 0.25rem 0; }
        .artifact-editor .ProseMirror code {
          background: hsl(208 25% 14%);
          border-radius: 4px;
          padding: 1px 4px;
          font-size: 0.78rem;
        }
        .artifact-editor .ProseMirror pre {
          background: hsl(208 25% 7%);
          border: 1px solid hsl(208 25% 14%);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin: 0.5rem 0;
          overflow-x: auto;
        }
        .artifact-editor .ProseMirror pre code {
          background: none;
          padding: 0;
        }
        .artifact-editor .ProseMirror ul, .artifact-editor .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.25rem 0;
        }
        .artifact-editor .ProseMirror li { margin: 0.125rem 0; }
        .artifact-editor .ProseMirror blockquote {
          border-left: 3px solid hsl(200 85% 45% / 0.4);
          padding-left: 0.75rem;
          margin: 0.5rem 0;
          color: hsl(210 8% 65%);
        }
        .artifact-editor .ProseMirror hr {
          border: none;
          border-top: 1px solid hsl(208 25% 16%);
          margin: 1rem 0;
        }
        .artifact-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(210 6% 40%);
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  )
}

function UnsupportedPlaceholder({ fileName, ext }: { fileName: string; ext: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-[hsl(208_25%_16%)] bg-[hsl(208_25%_11%)] px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(208_25%_14%)]">
          <File className="h-6 w-6 text-[hsl(210_8%_55%)]" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-[hsl(210_13%_85%)]">
          {fileName}
        </p>
        <p className="mt-1.5 text-xs text-[hsl(210_8%_55%)]">
          Preview not available for <span className="font-mono">{ext}</span> files
        </p>
      </div>
    </div>
  )
}

function FileKindIcon({ kind }: { kind?: string; fileName?: string }) {
  if (kind === 'image') return <Image className="h-4 w-4 text-[hsl(200_85%_55%)]" strokeWidth={1.75} />
  if (kind === 'text') return <FileText className="h-4 w-4 text-[hsl(200_85%_55%)]" strokeWidth={1.75} />
  return <File className="h-4 w-4 text-[hsl(210_8%_55%)]" strokeWidth={1.75} />
}
