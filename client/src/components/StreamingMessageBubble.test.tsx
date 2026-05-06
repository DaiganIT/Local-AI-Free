import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('renders thinking panel (not a collapsible) when thinkingContent provided while streaming', () => {
    const { container } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="Let me think about this..."
        isThinkingStreaming={true}
      />,
    )
    // Panel should be present
    expect(container.querySelector('[data-thinking-panel]')).toBeTruthy()
    // No toggle button — "Thoughts" collapsible is gone
    expect(screen.queryByText('Thoughts')).toBeNull()
  })

  it('shows "Thinking…" label with pulsing dot when isThinkingStreaming is true', () => {
    const { container } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="reasoning content"
        isThinkingStreaming={true}
      />,
    )
    expect(screen.getByText('Thinking…')).toBeTruthy()
    expect(container.querySelector('[data-thinking-streaming]')).toBeTruthy()
  })

  it('thinking panel has a fixed-height scrollable content area', () => {
    const { container } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="some content"
        isThinkingStreaming={true}
      />,
    )
    const scroll = container.querySelector('[data-thinking-scroll]')
    expect(scroll).toBeTruthy()
  })

  it('renders thinking content text inside the panel', () => {
    render(
      <StreamingMessageBubble
        content="The answer is 42"
        isStreaming={false}
        thinkingContent="Let me think about this..."
        isThinkingStreaming={true}
      />,
    )
    expect(screen.getByText('Let me think about this...')).toBeTruthy()
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

  it('marks thinking panel as exiting when isThinkingStreaming transitions from true to false', () => {
    const { container, rerender } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="Some reasoning..."
        isThinkingStreaming={true}
      />,
    )
    // Panel is visible and not exiting
    expect(container.querySelector('[data-thinking-panel]')).toBeTruthy()
    expect(container.querySelector('[data-thinking-exiting]')).toBeNull()

    // Thinking ends — panel enters exit state
    rerender(
      <StreamingMessageBubble
        content="Answer"
        isStreaming={true}
        thinkingContent="Some reasoning..."
        isThinkingStreaming={false}
      />,
    )
    expect(container.querySelector('[data-thinking-exiting]')).toBeTruthy()
  })

  it('removes thinking panel from DOM after exit transition completes', () => {
    const { container, rerender } = render(
      <StreamingMessageBubble
        content=""
        isStreaming={true}
        thinkingContent="Some reasoning..."
        isThinkingStreaming={true}
      />,
    )

    rerender(
      <StreamingMessageBubble
        content="Answer"
        isStreaming={true}
        thinkingContent="Some reasoning..."
        isThinkingStreaming={false}
      />,
    )

    // Fire the transitionEnd event to simulate CSS animation completing
    const panel = container.querySelector('[data-thinking-exiting]')
    expect(panel).toBeTruthy()
    fireEvent.transitionEnd(panel!)

    // Panel should now be gone from the DOM
    expect(container.querySelector('[data-thinking-panel]')).toBeNull()
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
