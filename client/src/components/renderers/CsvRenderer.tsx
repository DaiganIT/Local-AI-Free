import { useCallback, useEffect, useRef, useState } from 'react'
import { SaveBar } from './SaveBar'

interface CsvRendererProps {
  content: string
  onSave: (content: string) => void
  isSaving: boolean
}

// ── CSV parse / serialize ────────────────────────────────────────────────────

const DELIMITERS = [',', ';', '\t', '|'] as const
type Delimiter = (typeof DELIMITERS)[number]

const DELIMITER_LABEL: Record<Delimiter, string> = {
  ',': 'comma',
  ';': 'semicolon',
  '\t': 'tab',
  '|': 'pipe',
}

/** Sniff the most likely delimiter from the first non-empty line. */
function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? ''
  let best: Delimiter = ','
  let bestCount = 0
  for (const delim of DELIMITERS) {
    // Count unquoted occurrences only
    let count = 0
    let inQuotes = false
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes
      else if (!inQuotes && ch === delim) count++
    }
    if (count > bestCount) { bestCount = count; best = delim }
  }
  return best
}

function parseCsvWithDelimiter(text: string, delim: Delimiter): string[][] {
  const rows: string[][] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const cells: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cell += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === delim) { cells.push(cell); cell = '' }
        else cell += ch
      }
    }
    cells.push(cell)
    rows.push(cells)
  }
  return rows
}

function serializeCsv(rows: string[][], delim: Delimiter): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(delim) || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`
          }
          return cell
        })
        .join(delim),
    )
    .join('\n')
}

function gridsEqual(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, ri) => row.length === b[ri].length && row.every((cell, ci) => cell === b[ri][ci]))
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Editable spreadsheet renderer for .csv files. Every cell is an inline
 * input. Tab/Shift-Tab navigate between cells; Enter moves down a row.
 * The header row (row 0) is visually distinct but still editable.
 */
export function CsvRenderer({ content, onSave, isSaving }: CsvRendererProps) {
  const delimiter = detectDelimiter(content)
  const [grid, setGrid] = useState<string[][]>(() => parseCsvWithDelimiter(content, delimiter))
  const originalRef = useRef<string[][]>(parseCsvWithDelimiter(content, delimiter))
  const tableRef = useRef<HTMLTableElement>(null)

  // Sync when external content changes (e.g. after a successful save)
  useEffect(() => {
    const parsed = parseCsvWithDelimiter(content, delimiter)
    setGrid(parsed)
    originalRef.current = parsed
  }, [content, delimiter])

  const isDirty = !gridsEqual(grid, originalRef.current)

  const colCount = Math.max(...grid.map((r) => r.length), 0)
  const rowCount = grid.length

  function updateCell(ri: number, ci: number, value: string) {
    setGrid((prev) =>
      prev.map((row, r) =>
        r === ri ? row.map((cell, c) => (c === ci ? value : cell)) : row,
      ),
    )
  }

  const handleSave = useCallback(() => {
    if (isSaving) return
    onSave(serializeCsv(grid, delimiter))
  }, [grid, delimiter, isSaving, onSave])

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

  // Navigate with Tab / Enter inside the grid
  function handleCellKeyDown(e: React.KeyboardEvent<HTMLInputElement>, ri: number, ci: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusCell(ri + 1, ci)
    }
    // Tab / Shift-Tab is handled natively by the browser since inputs are in DOM order
  }

  function focusCell(ri: number, ci: number) {
    const table = tableRef.current
    if (!table) return
    const input = table.querySelector<HTMLInputElement>(
      `[data-cell="${ri}-${ci}"]`,
    )
    input?.focus()
    input?.select()
  }

  if (grid.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-discord-text-muted">Empty CSV file</p>
      </div>
    )
  }

  const [header, ...body] = grid

  return (
    <div className="flex h-full flex-col">
      <SaveBar isDirty={isDirty} isSaving={isSaving} onSave={handleSave} />

      {/* Scrollable grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          ref={tableRef}
          className="w-full border-collapse text-[0.8rem]"
          style={{ tableLayout: 'auto' }}
        >
          {/* Header row */}
          <thead>
            <tr>
              {/* Row-number gutter */}
              <th className="sticky left-0 top-0 z-20 w-8 border-b border-r border-discord-border bg-discord-input px-2 text-center font-mono text-[0.6rem] text-discord-text-muted select-none" />
              {header.map((cell, ci) => (
                <th
                  key={ci}
                  className="sticky top-0 z-10 min-w-28 border-b border-r border-discord-border bg-[hsl(208_25%_12%)] p-0"
                >
                  <input
                    data-cell={`0-${ci}`}
                    value={cell}
                    onChange={(e) => updateCell(0, ci, e.target.value)}
                    onKeyDown={(e) => handleCellKeyDown(e, 0, ci)}
                    className="w-full bg-transparent px-3 py-2 font-semibold text-discord-text outline-none placeholder:text-discord-text-muted focus:bg-[hsl(200_85%_55%/6%)]"
                  />
                </th>
              ))}
            </tr>
          </thead>

          {/* Data rows */}
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="group">
                {/* Row number */}
                <td className="sticky left-0 border-b border-r border-discord-border-subtle bg-discord-input px-2 text-center font-mono text-[0.6rem] text-discord-text-muted select-none group-hover:bg-discord-surface-hover">
                  {ri + 1}
                </td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td
                    key={ci}
                    className={`border-b border-r border-discord-border-subtle p-0 ${
                      ri % 2 === 1 ? 'bg-discord-surface/30' : ''
                    }`}
                  >
                    <input
                      data-cell={`${ri + 1}-${ci}`}
                      value={row[ci] ?? ''}
                      onChange={(e) => updateCell(ri + 1, ci, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, ri + 1, ci)}
                      className="w-full bg-transparent px-3 py-1.5 text-discord-text-dim outline-none placeholder:text-discord-text-muted focus:bg-[hsl(200_85%_55%/6%)] focus:text-discord-text"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-discord-border-subtle px-4 py-2 flex items-center justify-between">
        <span className="text-[0.65rem] text-discord-text-muted">
          {rowCount - 1} row{rowCount - 1 !== 1 ? 's' : ''} · {colCount} column{colCount !== 1 ? 's' : ''}
        </span>
        <span className="text-[0.65rem] text-discord-text-muted">
          delimiter: <span className="font-mono">{DELIMITER_LABEL[delimiter]}</span>
        </span>
      </div>
    </div>
  )
}
