import { useCallback, useEffect, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SaveBar } from './SaveBar'

interface MarkdownRendererProps {
  initialContent: string
  onSave: (content: string) => void
  isSaving: boolean
}

/**
 * Renders a .md file. View mode uses react-markdown for a proper document
 * layout. Edit mode switches to a raw textarea so the source stays valid
 * markdown (avoids TipTap mangling the content into HTML).
 */
export function MarkdownRenderer({ initialContent, onSave, isSaving }: MarkdownRendererProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)

  useEffect(() => {
    setDraft(initialContent)
  }, [initialContent])

  const isDirty = draft !== initialContent

  const handleSave = useCallback(() => {
    if (isSaving) return
    onSave(draft)
  }, [draft, isSaving, onSave])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave, isEditing])

  const modeToggle = (
    <button
      type="button"
      onClick={() => setIsEditing((v) => !v)}
      className="flex items-center gap-1 rounded-md border border-discord-border bg-discord-surface px-2 py-0.5 text-[0.65rem] font-medium text-discord-text-dim transition-colors hover:bg-discord-surface-hover hover:text-discord-text"
    >
      {isEditing ? (
        <><Eye className="h-3 w-3" strokeWidth={2} /> Preview</>
      ) : (
        <><Pencil className="h-3 w-3" strokeWidth={2} /> Edit</>
      )}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <SaveBar
        isDirty={isDirty && isEditing}
        isSaving={isSaving}
        onSave={handleSave}
        extra={modeToggle}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-4 font-mono text-[0.82rem] leading-relaxed text-[hsl(210_13%_85%)] outline-none"
          />
        ) : (
          <div className="artifact-md p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
          </div>
        )}
      </div>

      <style>{`
        .artifact-md { color: hsl(210 13% 85%); font-size: 0.875rem; line-height: 1.75; }
        .artifact-md h1 { font-size: 1.6rem; font-weight: 700; color: hsl(210 13% 96%); margin: 0 0 0.6rem; border-bottom: 1px solid hsl(208 25% 16%); padding-bottom: 0.4rem; }
        .artifact-md h2 { font-size: 1.25rem; font-weight: 600; color: hsl(210 13% 95%); margin: 1.4rem 0 0.4rem; }
        .artifact-md h3 { font-size: 1.05rem; font-weight: 600; color: hsl(210 13% 92%); margin: 1rem 0 0.3rem; }
        .artifact-md h4,
        .artifact-md h5,
        .artifact-md h6 { font-weight: 600; color: hsl(210 13% 90%); margin: 0.75rem 0 0.25rem; }
        .artifact-md p { margin: 0.6rem 0; }
        .artifact-md a { color: hsl(200 85% 60%); text-decoration: underline; text-underline-offset: 2px; }
        .artifact-md a:hover { color: hsl(200 85% 70%); }
        .artifact-md strong { color: hsl(210 13% 95%); font-weight: 600; }
        .artifact-md em { color: hsl(210 13% 80%); }
        .artifact-md code {
          background: hsl(208 25% 14%);
          border: 1px solid hsl(208 25% 18%);
          border-radius: 4px;
          padding: 1px 5px;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 0.78rem;
          color: hsl(200 85% 72%);
        }
        .artifact-md pre {
          background: hsl(208 25% 7%);
          border: 1px solid hsl(208 25% 14%);
          border-radius: 8px;
          padding: 0.875rem 1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
        }
        .artifact-md pre code { background: none; border: none; padding: 0; color: hsl(210 13% 82%); font-size: 0.8rem; }
        .artifact-md ul { list-style: disc; padding-left: 1.5rem; margin: 0.4rem 0; }
        .artifact-md ol { list-style: decimal; padding-left: 1.5rem; margin: 0.4rem 0; }
        .artifact-md li { margin: 0.2rem 0; }
        .artifact-md li > ul,
        .artifact-md li > ol { margin: 0.1rem 0; }
        .artifact-md blockquote {
          border-left: 3px solid hsl(200 85% 45% / 0.5);
          padding: 0.2rem 0 0.2rem 0.9rem;
          margin: 0.6rem 0;
          color: hsl(210 8% 62%);
          font-style: italic;
        }
        .artifact-md hr { border: none; border-top: 1px solid hsl(208 25% 16%); margin: 1.2rem 0; }
        .artifact-md table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 0.75rem 0; }
        .artifact-md th { background: hsl(208 25% 12%); border: 1px solid hsl(208 25% 18%); padding: 0.45rem 0.75rem; text-align: left; font-weight: 600; color: hsl(210 13% 90%); }
        .artifact-md td { border: 1px solid hsl(208 25% 16%); padding: 0.4rem 0.75rem; color: hsl(210 13% 80%); }
        .artifact-md tr:nth-child(even) td { background: hsl(208 25% 10% / 0.5); }
        .artifact-md input[type="checkbox"] { margin-right: 0.4rem; accent-color: hsl(200 85% 55%); }
        .artifact-md img { max-width: 100%; border-radius: 6px; margin: 0.5rem 0; }
      `}</style>
    </div>
  )
}
