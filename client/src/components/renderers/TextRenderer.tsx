import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { SaveBar } from './SaveBar'

interface TextRendererProps {
  initialContent: string
  onSave: (content: string) => void
  isSaving: boolean
}

/**
 * Plain-text editor backed by TipTap. Used for .txt files and as the
 * fallback for code files until a proper code editor is integrated.
 */
export function TextRenderer({ initialContent, onSave, isSaving }: TextRendererProps) {
  const [isDirty, setIsDirty] = useState(false)
  const initialContentRef = useRef(initialContent)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Empty file' }),
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: 'artifact-text-editor outline-none h-full' },
    },
    onUpdate: ({ editor }) => {
      setIsDirty(editor.getText() !== initialContentRef.current)
    },
  })

  useEffect(() => {
    initialContentRef.current = initialContent
    setIsDirty(false)
  }, [initialContent])

  const handleSave = useCallback(() => {
    if (!editor || isSaving) return
    onSave(editor.getText())
  }, [editor, isSaving, onSave])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  return (
    <div className="flex h-full flex-col">
      <SaveBar isDirty={isDirty} isSaving={isSaving} onSave={handleSave} />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .artifact-text-editor .ProseMirror {
          min-height: 100%;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 0.82rem;
          line-height: 1.7;
          color: hsl(210 13% 85%);
        }
        .artifact-text-editor .ProseMirror p { margin: 0.25rem 0; }
        .artifact-text-editor .ProseMirror p.is-editor-empty:first-child::before {
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
