import { describe, it, expect } from 'vitest'
import { parseMention } from './parseMention'

describe('parseMention', () => {
  it('returns inactive when there is no @', () => {
    expect(parseMention('hello world', 11)).toEqual({ active: false })
  })

  it('returns active with empty query when cursor is right after @', () => {
    // "hello @|"  (cursor at position 7)
    expect(parseMention('hello @', 7)).toEqual({ active: true, query: '', triggerStart: 6 })
  })

  it('returns active with query when typing after @', () => {
    // "hello @wo|"  (cursor at 9)
    expect(parseMention('hello @wo', 9)).toEqual({ active: true, query: 'wo', triggerStart: 6 })
  })

  it('returns inactive when there is a space between @ and cursor', () => {
    // "@ |"  (cursor at 2)
    expect(parseMention('@ ', 2)).toEqual({ active: false })
  })

  it('returns inactive when @ appears but cursor is in a different word', () => {
    // "hello @file world|"  (cursor after "world", space terminates mention)
    expect(parseMention('hello @file world', 17)).toEqual({ active: false })
  })

  it('returns active when @ is the first character', () => {
    expect(parseMention('@foo', 4)).toEqual({ active: true, query: 'foo', triggerStart: 0 })
  })

  it('returns active for the last @ when there are multiple words', () => {
    // "hello world @ba|"  (cursor at 15)
    expect(parseMention('hello world @ba', 15)).toEqual({ active: true, query: 'ba', triggerStart: 12 })
  })

  it('respects cursorPos — ignores characters after cursor', () => {
    // value is "@foo" but cursor is at position 2 — query should be "f" not "fo"
    expect(parseMention('@foo', 2)).toEqual({ active: true, query: 'f', triggerStart: 0 })
  })

  it('returns inactive when cursorPos is 0', () => {
    expect(parseMention('@foo', 0)).toEqual({ active: false })
  })
})
