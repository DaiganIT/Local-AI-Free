import { describe, it, expect } from 'vitest'
import { parsePath } from '#/lib/navigation'

describe('layout collapse logic from parsePath', () => {
  it('identifies file param for artifact open state', () => {
    const state = parsePath('/hosts/h1/a/a1?file=AGENTS.md')
    expect(state.file).toBe('AGENTS.md')
  })

  it('returns undefined file when no file param', () => {
    const state = parsePath('/hosts/h1/a/a1')
    expect(state.file).toBeUndefined()
  })

  it('chat route with file param also has file', () => {
    const state = parsePath('/hosts/h1/a/a1/c/c1?file=notes.md')
    expect(state.file).toBe('notes.md')
    expect(state.kind).toBe('chat')
  })
})
