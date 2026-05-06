import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { FileMentionPopover } from './FileMentionPopover'
import { useRecentUploads } from '#/hooks/useRecentUploads'
import type { AgentFolderNode } from '#/lib/types'
import type { PendingAttachment } from '#/hooks'

/** Zero-width space used as a cursor anchor right after chip insertion. */
const ZWS = '\u200B'

interface MentionQuery {
  query: string
  /** Index within the text node where `@` sits. */
  triggerStart: number
  textNode: Text
}

export interface MentionInputHandle {
  /** Plain text content (chip nodes are excluded from the text). */
  getText(): string
  /** All mention chips currently in the editor. */
  getMentions(): PendingAttachment[]
  /** Clears the editor completely. */
  clear(): void
  focus(): void
}

interface MentionInputProps {
  agentId: string
  placeholder?: string
  disabled?: boolean
  onSend: () => void
  onHasTextChange: (hasText: boolean) => void
}

/** Scan backward from cursor in the current text node to detect an `@` mention. */
function getMentionAtCursor(): MentionQuery | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return null
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null

  const textNode = range.startContainer as Text
  const textBefore = (textNode.textContent ?? '').slice(0, range.startOffset)

  for (let i = textBefore.length - 1; i >= 0; i--) {
    if (textBefore[i] === '@') return { query: textBefore.slice(i + 1), triggerStart: i, textNode }
    if (/\s/.test(textBefore[i])) return null
  }
  return null
}

/**
 * Extract text from the editor. Text nodes contribute directly.
 * Chip spans contribute `@filename` so the sent message content
 * includes inline mention references (they're rendered inline, not as attachments).
 */
function getEditorText(el: HTMLElement): string {
  let text = ''
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').replace(/\u200B/g, '')
    } else {
      const chip = node as HTMLElement
      if (chip.dataset?.mentionName) {
        text += `@${chip.dataset.mentionName}`
      }
    }
  })
  return text
}

function getEditorMentions(el: HTMLElement): PendingAttachment[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-mention-server-path]')).map((chip) => ({
    id: chip.dataset.mentionId ?? '',
    name: chip.dataset.mentionName ?? '',
    status: 'done' as const,
    serverPath: chip.dataset.mentionServerPath ?? '',
  }))
}

function buildChipElement(file: AgentFolderNode, id: string, onRemove: () => void): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.mentionId = id
  chip.dataset.mentionName = file.name
  chip.dataset.mentionServerPath = file.id

  chip.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: 4px',
    'padding: 2px 6px 2px 5px',
    'border-radius: 5px',
    'background: rgba(139, 92, 246, 0.18)',
    'border: 1px solid rgba(139, 92, 246, 0.35)',
    'color: rgb(216, 180, 254)',
    'font-size: 0.85em',
    'cursor: default',
    'user-select: none',
    'white-space: nowrap',
    'margin: 0 2px',
    'vertical-align: middle',
    'line-height: 1.4',
  ].join('; ')

  const nameEl = document.createElement('span')
  nameEl.textContent = `@${file.name}`
  chip.appendChild(nameEl)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.textContent = '×'
  removeBtn.setAttribute('aria-label', `Remove @${file.name}`)
  removeBtn.style.cssText = [
    'background: none',
    'border: none',
    'cursor: pointer',
    'color: inherit',
    'padding: 0',
    'font-size: 1.1em',
    'line-height: 1',
    'opacity: 0.6',
    'margin-left: 1px',
  ].join('; ')
  removeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    chip.parentNode?.removeChild(chip)
    onRemove()
  })
  chip.appendChild(removeBtn)

  return chip
}

export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  ({ agentId, placeholder, disabled, onSend, onHasTextChange }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const idCounter = useRef(0)
    const mentionQueryRef = useRef<MentionQuery | null>(null)
    const { files: recentFiles } = useRecentUploads(agentId)

    const [popover, setPopover] = useState<{ query: string; filtered: AgentFolderNode[] } | null>(null)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [isEmpty, setIsEmpty] = useState(true)

    const updateEmptyState = useCallback(
      (el: HTMLElement) => {
        const hasText = getEditorText(el).trim().length > 0
        const hasMentions = el.querySelectorAll('[data-mention-server-path]').length > 0
        const empty = !hasText && !hasMentions
        setIsEmpty(empty)
        onHasTextChange(!empty)
      },
      [onHasTextChange],
    )

    useImperativeHandle(ref, () => ({
      getText: () => (editorRef.current ? getEditorText(editorRef.current) : ''),
      getMentions: () => (editorRef.current ? getEditorMentions(editorRef.current) : []),
      clear: () => {
        if (!editorRef.current) return
        editorRef.current.innerHTML = ''
        setIsEmpty(true)
        setPopover(null)
        onHasTextChange(false)
      },
      focus: () => editorRef.current?.focus(),
    }))

    const insertChip = useCallback(
      (file: AgentFolderNode) => {
        const mq = mentionQueryRef.current
        if (!mq) return

        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return

        const { textNode, triggerStart, query } = mq
        const fullText = textNode.textContent ?? ''
        const before = fullText.slice(0, triggerStart)
        const after = fullText.slice(triggerStart + 1 + query.length)

        const id = `mention-${++idCounter.current}`
        const chip = buildChipElement(file, id, () => {
          if (editorRef.current) updateEmptyState(editorRef.current)
        })

        const beforeNode = document.createTextNode(before)
        // ZWS gives the cursor a text node to land in after the chip
        const afterNode = document.createTextNode(ZWS + after)

        const parent = textNode.parentNode!
        parent.replaceChild(afterNode, textNode)
        parent.insertBefore(chip, afterNode)
        parent.insertBefore(beforeNode, chip)

        // Move cursor to position 1 in afterNode (past the ZWS)
        const newRange = document.createRange()
        newRange.setStart(afterNode, 1)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)

        mentionQueryRef.current = null
        setPopover(null)
        if (editorRef.current) updateEmptyState(editorRef.current)
      },
      [updateEmptyState],
    )

    const handleInput = useCallback(() => {
      const el = editorRef.current
      if (!el) return

      const mq = getMentionAtCursor()
      mentionQueryRef.current = mq

      if (mq) {
        const filtered = recentFiles.filter((f) =>
          mq.query ? f.name.toLowerCase().includes(mq.query.toLowerCase()) : true,
        )
        setPopover({ query: mq.query, filtered })
        setSelectedIndex(0)
      } else {
        setPopover(null)
      }

      updateEmptyState(el)
    }, [recentFiles, updateEmptyState])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (popover) {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex((i) => Math.max(0, i - 1))
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex((i) => Math.min(popover.filtered.length - 1, i + 1))
            return
          }
          if (e.key === 'Enter' && popover.filtered.length > 0) {
            e.preventDefault()
            insertChip(popover.filtered[selectedIndex] ?? popover.filtered[0])
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            mentionQueryRef.current = null
            setPopover(null)
            return
          }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onSend()
        }
      },
      [popover, selectedIndex, insertChip, onSend],
    )

    return (
      <div className="relative flex-1 min-w-0">
        {popover && (
          <FileMentionPopover
            files={popover.filtered}
            query={popover.query}
            selectedIndex={selectedIndex}
            onSelect={insertChip}
            onClose={() => setPopover(null)}
          />
        )}
        <div
          ref={editorRef}
          contentEditable={disabled ? 'false' : 'true'}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="false"
          aria-label="Message input"
          aria-disabled={disabled}
          className={`w-full rounded-lg bg-[hsl(208_25%_12%)] border border-[hsl(208_25%_16%)] text-[hsl(210_13%_95%)] text-[0.875rem] px-4 py-[0.65rem] outline-none transition-colors focus:border-[hsl(200_85%_55%)]/50 min-h-[2.5rem] leading-normal ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ wordBreak: 'break-word' }}
        />
        {isEmpty && (
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.875rem] text-[hsl(210_6%_40%)] select-none"
            aria-hidden="true"
          >
            {placeholder}
          </span>
        )}
      </div>
    )
  },
)

MentionInput.displayName = 'MentionInput'
