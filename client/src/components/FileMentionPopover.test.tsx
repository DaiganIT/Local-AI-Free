import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileMentionPopover } from './FileMentionPopover'
import type { AgentFolderNode } from '#/lib/types'

function file(id: string, name: string): AgentFolderNode {
  return { id, name, kind: 'file' }
}

const files: AgentFolderNode[] = [
  file('uploads/report.pdf', 'report.pdf'),
  file('uploads/notes.md', 'notes.md'),
  file('uploads/data.csv', 'data.csv'),
]

const noop = vi.fn()

describe('FileMentionPopover', () => {
  it('renders all files when query is empty', () => {
    render(
      <FileMentionPopover
        files={files}
        query=""
        selectedIndex={0}
        onSelect={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByText('report.pdf')).toBeTruthy()
    expect(screen.getByText('notes.md')).toBeTruthy()
    expect(screen.getByText('data.csv')).toBeTruthy()
  })

  it('filters files by query (case-insensitive)', () => {
    render(
      <FileMentionPopover
        files={files}
        query="NOTES"
        selectedIndex={0}
        onSelect={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByText('notes.md')).toBeTruthy()
    expect(screen.queryByText('report.pdf')).toBeNull()
    expect(screen.queryByText('data.csv')).toBeNull()
  })

  it('shows "No recent files" when filter yields nothing', () => {
    render(
      <FileMentionPopover
        files={files}
        query="zzz"
        selectedIndex={0}
        onSelect={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByText('No recent files')).toBeTruthy()
  })

  it('highlights the item at selectedIndex', () => {
    render(
      <FileMentionPopover
        files={files}
        query=""
        selectedIndex={1}
        onSelect={noop}
        onClose={noop}
      />,
    )
    const options = screen.getAllByRole('option')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-selected')).toBe('false')
  })

  it('calls onSelect with the correct file on mousedown', () => {
    const onSelect = vi.fn()
    render(
      <FileMentionPopover
        files={files}
        query=""
        selectedIndex={0}
        onSelect={onSelect}
        onClose={noop}
      />,
    )
    fireEvent.mouseDown(screen.getByText('notes.md'))
    expect(onSelect).toHaveBeenCalledWith(files[1])
  })
})
