interface CsvRendererProps {
  content: string
}

/** Parse a CSV string into a 2D array, handling quoted fields. */
function parseCsv(text: string): string[][] {
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
        else if (ch === ',') { cells.push(cell); cell = '' }
        else cell += ch
      }
    }
    cells.push(cell)
    rows.push(cells)
  }
  return rows
}

/**
 * Renders a .csv file as a sticky-header table. The first row is treated
 * as the header. Handles quoted fields and double-quote escaping.
 */
export function CsvRenderer({ content }: CsvRendererProps) {
  const rows = parseCsv(content)

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-discord-text-muted">Empty CSV file</p>
      </div>
    )
  }

  const [header, ...body] = rows
  const colCount = header?.length ?? 0
  const rowCount = body.length

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable table area */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 border border-discord-border bg-discord-surface px-3 py-2 text-left font-semibold text-discord-text whitespace-nowrap"
                >
                  {cell || <span className="text-discord-text-muted">col {i + 1}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr
                key={ri}
                className="transition-colors hover:bg-discord-surface-hover"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`border border-discord-border-subtle px-3 py-1.5 text-discord-text-dim ${
                      ri % 2 === 1 ? 'bg-discord-surface/40' : ''
                    }`}
                  >
                    {cell}
                  </td>
                ))}
                {/* Fill missing cells if this row is shorter than the header */}
                {row.length < colCount &&
                  Array.from({ length: colCount - row.length }).map((_, ci) => (
                    <td
                      key={`empty-${ci}`}
                      className="border border-discord-border-subtle px-3 py-1.5"
                    />
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer stats */}
      <div className="shrink-0 border-t border-discord-border-subtle px-4 py-2">
        <span className="text-[0.65rem] text-discord-text-muted">
          {rowCount} row{rowCount !== 1 ? 's' : ''} · {colCount} column{colCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
