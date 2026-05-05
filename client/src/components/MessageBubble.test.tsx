import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'

describe('MessageBubble — attachment display (F8)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows attachment badges for user messages with attachments', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Check this file',
      timestamp: new Date().toISOString(),
      attachments: [
        { name: 'report.txt', path: 'uploads/report.txt', size: 1024 },
        { name: 'notes.md', path: 'uploads/notes.md', size: 512 },
      ],
    }

    const { container } = render(
      <MessageBubble msg={msg} isLast={false} />,
    )

    // Attachment container should exist
    const attachmentsEl = container.querySelector('[data-message-attachments]')
    expect(attachmentsEl).toBeTruthy()

    // Both attachment names should be visible
    expect(screen.getByText('report.txt')).toBeTruthy()
    expect(screen.getByText('notes.md')).toBeTruthy()
  })

  it('does not show attachment badges when attachments is null', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'No attachments here',
      timestamp: new Date().toISOString(),
      attachments: null,
    }

    const { container } = render(
      <MessageBubble msg={msg} isLast={false} />,
    )

    expect(container.querySelector('[data-message-attachments]')).toBeNull()
  })

  it('does not show attachment badges when attachments is empty array', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Empty attachments',
      timestamp: new Date().toISOString(),
      attachments: [],
    }

    const { container } = render(
      <MessageBubble msg={msg} isLast={false} />,
    )

    expect(container.querySelector('[data-message-attachments]')).toBeNull()
  })

  it('does not show attachment badges for assistant messages', () => {
    const msg = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: 'I read your file.',
      timestamp: new Date().toISOString(),
      attachments: [
        { name: 'report.txt', path: 'uploads/report.txt', size: 1024 },
      ],
    }

    const { container } = render(
      <MessageBubble msg={msg} isLast={false} />,
    )

    // Assistant messages don't show attachment badges
    expect(container.querySelector('[data-message-attachments]')).toBeNull()
  })
})
