import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  it('renders plain text', () => {
    const { container } = render(<MarkdownContent content="Hello world" />)
    expect(container.textContent).toContain('Hello world')
  })

  it('renders bold text', () => {
    const { container } = render(<MarkdownContent content="**bold**" />)
    const strong = container.querySelector('strong')
    expect(strong).toBeTruthy()
    expect(strong?.textContent).toBe('bold')
  })

  it('renders inline code', () => {
    const { container } = render(<MarkdownContent content="`code`" />)
    const code = container.querySelector('code')
    expect(code).toBeTruthy()
    expect(code?.textContent).toBe('code')
  })

  it('renders code blocks', () => {
    const { container } = render(
      <MarkdownContent content={"```js\nconsole.log('hi')\n```"} />,
    )
    const pre = container.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre?.textContent).toContain("console.log('hi')")
  })

  it('renders links', () => {
    const { container } = render(
      <MarkdownContent content="[click](https://example.com)" />,
    )
    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })

  it('wraps content in markdown class div', () => {
    const { container } = render(<MarkdownContent content="text" />)
    expect(container.querySelector('.markdown')).toBeTruthy()
  })

  it('renders trailing element inside markdown div', () => {
    const { container } = render(
      <MarkdownContent
        content="text"
        trailing={<span data-streaming-cursor className="cursor" />}
      />,
    )
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
    // Trailing element should be inside the .markdown div
    const markdownDiv = container.querySelector('.markdown')
    expect(markdownDiv?.contains(cursor)).toBe(true)
  })

  it('renders without trailing element', () => {
    const { container } = render(<MarkdownContent content="text" />)
    expect(container.querySelector('[data-streaming-cursor]')).toBeNull()
  })
})