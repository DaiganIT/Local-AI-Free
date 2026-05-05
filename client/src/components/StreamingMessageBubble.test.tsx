import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreamingMessageBubble } from './StreamingMessageBubble'

describe('StreamingMessageBubble', () => {
  it('renders the provided content', () => {
    render(<StreamingMessageBubble content="Hello world" isStreaming={false} />)
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('shows a blinking cursor while streaming', () => {
    const { container } = render(
      <StreamingMessageBubble content="Thinking..." isStreaming={true} />,
    )
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
  })

  it('hides the cursor when streaming is done', () => {
    const { container } = render(
      <StreamingMessageBubble content="Done!" isStreaming={false} />,
    )
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeNull()
  })

  it('renders the bot avatar', () => {
    const { container } = render(
      <StreamingMessageBubble content="Hi" isStreaming={true} />,
    )
    // The Bot icon from lucide is rendered as an SVG inside the avatar container
    const avatar = container.querySelector('.streaming-avatar')
    expect(avatar).toBeTruthy()
  })

  it('renders thinking content as a collapsible block when provided', () => {
    render(
      <StreamingMessageBubble
        content="The answer is 42"
        isStreaming={false}
        thinkingContent="Let me think about this..."
      />,
    )
    // The thinking block should be rendered with a "Thoughts" toggle
    expect(screen.getByText('Thoughts')).toBeTruthy()
    // And the main text content
    expect(screen.getByText('The answer is 42')).toBeTruthy()
  })

  it('renders without thinking content', () => {
    const { container } = render(
      <StreamingMessageBubble content="Just text" isStreaming={true} />,
    )
    // No reasoning block
    expect(screen.queryByText('Thoughts')).toBeNull()
    // Text is present
    expect(screen.getByText('Just text')).toBeTruthy()
  })

  it('renders empty content with cursor while streaming', () => {
    const { container } = render(
      <StreamingMessageBubble content="" isStreaming={true} />,
    )
    // Cursor should still be visible even with empty content
    const cursor = container.querySelector('[data-streaming-cursor]')
    expect(cursor).toBeTruthy()
  })

  it('shows thinking streaming indicator while thinking is active but not after it ends', () => {
    const { container, rerender } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="Thinking..."
        isThinkingStreaming={true}
      />,
    )
    // Pulsing indicator should be present while thinking is streaming
    const indicator = container.querySelector('[data-thinking-streaming]')
    expect(indicator).toBeTruthy()

    // After thinking ends (but text is still streaming)
    rerender(
      <StreamingMessageBubble
        content="Answer"
        isStreaming={true}
        thinkingContent="I thought about it"
        isThinkingStreaming={false}
      />,
    )
    const indicatorAfterEnd = container.querySelector('[data-thinking-streaming]')
    expect(indicatorAfterEnd).toBeNull()
  })

  it('updates content reactively as streaming text grows', () => {
    const { rerender } = render(
      <StreamingMessageBubble content="Hello" isStreaming={true} />,
    )
    expect(screen.getByText('Hello')).toBeTruthy()

    rerender(
      <StreamingMessageBubble content="Hello world" isStreaming={true} />,
    )
    expect(screen.getByText('Hello world')).toBeTruthy()
  })
})
