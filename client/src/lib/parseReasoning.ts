const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

export interface ContentSegment {
  type: 'text' | 'reasoning'
  content: string
}

/**
 * Splits message content into text and reasoning segments.
 * Handles multiple non-nested <think>...</think> blocks.
 */
export function parseReasoning(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  let remaining = content
  let currentText = ''

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf(THINK_OPEN)

    if (openIdx === -1) {
      // No more reasoning blocks
      currentText += remaining
      remaining = ''
    } else {
      // Collect text before this <think>
      currentText += remaining.slice(0, openIdx)
      remaining = remaining.slice(openIdx + THINK_OPEN.length)

      const closeIdx = remaining.indexOf(THINK_CLOSE)
      if (closeIdx === -1) {
        // Unclosed tag — treat rest as text
        currentText += THINK_OPEN
        currentText += remaining
        remaining = ''
      } else {
        // Push accumulated text if any
        if (currentText) {
          segments.push({ type: 'text', content: currentText })
          currentText = ''
        }
        // Push the reasoning segment
        segments.push({ type: 'reasoning', content: remaining.slice(0, closeIdx).trim() })
        // Advance past the closing tag
        remaining = remaining.slice(closeIdx + THINK_CLOSE.length)
      }
    }
  }

  if (currentText) {
    segments.push({ type: 'text', content: currentText })
  }

  return segments
}
