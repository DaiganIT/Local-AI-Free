import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  /** Optional element rendered at the end, inline with the last text (e.g. streaming cursor). */
  trailing?: ReactNode
}

export function MarkdownContent({ content, trailing }: MarkdownContentProps) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {trailing}
    </div>
  )
}