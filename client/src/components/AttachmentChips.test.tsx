import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttachmentChips } from './AttachmentChips'
import type { PendingAttachment } from '#/hooks'

// Helper to extract the type badge text from an attachment chip
function getTypeBadge(container: HTMLElement, attachmentName: string): string | null {
  const chip = container.querySelector(`[data-attachment-name="${attachmentName}"]`)
  return chip?.querySelector('[data-type-badge]')?.textContent ?? null
}

const baseAttachments: PendingAttachment[] = [
  { id: 'att-1', name: 'report.txt', status: 'uploading' },
  { id: 'att-2', name: 'notes.md', status: 'done', serverPath: 'uploads/notes.md', size: 1024 },
  { id: 'att-3', name: 'bad.log', status: 'error', error: 'Upload failed' },
]

describe('AttachmentChips', () => {
  it('renders chips for each attachment', () => {
    render(<AttachmentChips attachments={baseAttachments} onRemove={vi.fn()} />)

    expect(screen.getByText('report.txt')).toBeTruthy()
    expect(screen.getByText('notes.md')).toBeTruthy()
    expect(screen.getByText('bad.log')).toBeTruthy()
  })

  it('shows spinner for uploading attachments', () => {
    const { container } = render(
      <AttachmentChips attachments={[baseAttachments[0]]} onRemove={vi.fn()} />,
    )

    // Should have a spinner element
    const spinner = container.querySelector('[data-attachment-spinner]')
    expect(spinner).toBeTruthy()
  })

  it('shows checkmark for done attachments', () => {
    render(<AttachmentChips attachments={[baseAttachments[1]]} onRemove={vi.fn()} />)

    expect(screen.getByText('notes.md')).toBeTruthy()
    // Should show size
    expect(screen.getByText('1.0 KB')).toBeTruthy()
  })

  it('shows error icon for failed attachments', () => {
    const { container } = render(
      <AttachmentChips attachments={[baseAttachments[2]]} onRemove={vi.fn()} />,
    )

    const errorIcon = container.querySelector('[data-attachment-error]')
    expect(errorIcon).toBeTruthy()
  })

  it('calls onRemove when × button is clicked', () => {
    const onRemove = vi.fn()
    render(<AttachmentChips attachments={baseAttachments} onRemove={onRemove} />)

    const removeButtons = screen.getAllByLabelText(/Remove/)
    fireEvent.click(removeButtons[0])

    expect(onRemove).toHaveBeenCalledWith('att-1')
  })

  it('renders nothing when attachments is empty', () => {
    const { container } = render(
      <AttachmentChips attachments={[]} onRemove={vi.fn()} />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('shows error tooltip text for failed attachment', () => {
    render(<AttachmentChips attachments={[baseAttachments[2]]} onRemove={vi.fn()} />)

    // The error icon should have a title with the error message
    expect(screen.getByTitle('Upload failed')).toBeTruthy()
  })

  it('shows image type badge for image attachments', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-img', name: 'photo.png', status: 'done', mimeType: 'image/png', size: 2048, serverPath: 'uploads/photo.png' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'photo.png')).toBe('IMG')
  })

  it('shows PDF type badge for PDF attachments', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-pdf', name: 'doc.pdf', status: 'done', mimeType: 'application/pdf', size: 4096, serverPath: 'uploads/doc.pdf' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'doc.pdf')).toBe('PDF')
  })

  it('shows DOCX type badge for DOCX attachments', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-docx', name: 'resume.docx', status: 'done', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 8192, serverPath: 'uploads/resume.docx' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'resume.docx')).toBe('DOCX')
  })

  it('shows code type badge for code file attachments', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-ts', name: 'app.ts', status: 'done', mimeType: 'text/typescript', size: 512, serverPath: 'uploads/app.ts' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'app.ts')).toBe('CODE')
  })

  it('shows TXT type badge for plain text attachments', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-txt', name: 'readme.txt', status: 'done', mimeType: 'text/plain', size: 256, serverPath: 'uploads/readme.txt' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'readme.txt')).toBe('TXT')
  })

  it('shows FILE type badge when mimeType is unknown', () => {
    const { container } = render(
      <AttachmentChips
        attachments={[{ id: 'att-unk', name: 'data.bin', status: 'done', size: 128, serverPath: 'uploads/data.bin' }]}
        onRemove={vi.fn()}
      />,
    )
    expect(getTypeBadge(container, 'data.bin')).toBe('FILE')
  })
})
