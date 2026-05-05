import { describe, it, expect } from 'vitest'
import { parseReasoning } from './parseReasoning'

describe('parseReasoning', () => {
  it('returns a single text segment when no <think> tags present', () => {
    const result = parseReasoning('Hello world!')
    expect(result).toEqual([{ type: 'text', content: 'Hello world!' }])
  })

  it('extracts a reasoning block from content', () => {
    const result = parseReasoning('First <think>thinking hard</think> final answer')
    expect(result).toEqual([
      { type: 'text', content: 'First ' },
      { type: 'reasoning', content: 'thinking hard' },
      { type: 'text', content: ' final answer' },
    ])
  })

  it('handles content starting with reasoning', () => {
    const result = parseReasoning('<think>let me think</think> here is the answer')
    expect(result).toEqual([
      { type: 'reasoning', content: 'let me think' },
      { type: 'text', content: ' here is the answer' },
    ])
  })

  it('handles content ending with reasoning', () => {
    const result = parseReasoning('here is my answer <think>done thinking</think>')
    expect(result).toEqual([
      { type: 'text', content: 'here is my answer ' },
      { type: 'reasoning', content: 'done thinking' },
    ])
  })

  it('handles multiple reasoning blocks', () => {
    const result = parseReasoning('A <think>first</think> B <think>second</think> C')
    expect(result).toEqual([
      { type: 'text', content: 'A ' },
      { type: 'reasoning', content: 'first' },
      { type: 'text', content: ' B ' },
      { type: 'reasoning', content: 'second' },
      { type: 'text', content: ' C' },
    ])
  })

  it('trims whitespace from reasoning content', () => {
    const result = parseReasoning('  lots of spaces  ')
    expect(result).toEqual([{ type: 'text', content: '  lots of spaces  ' }])
  })

  it('handles unclosed <think> by treating tags as text', () => {
    const result = parseReasoning('hello <think>no close')
    expect(result).toEqual([{ type: 'text', content: 'hello <think>no close' }])
  })

  it('handles empty string', () => {
    const result = parseReasoning('')
    expect(result).toEqual([])
  })
})

