import { describe, it, expect } from 'vitest'
import { formatTokenCount, formatContextUsage } from './formatting'

describe('formatTokenCount', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokenCount(42)).toBe('42')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1500)).toBe('1.5k')
  })
})

describe('formatContextUsage', () => {
  it('returns percentage when both values exist', () => {
    expect(formatContextUsage({ totalTokens: 4096, contextWindow: 8192 })).toBe('50%')
  })

  it('rounds up to 100%', () => {
    expect(formatContextUsage({ totalTokens: 9000, contextWindow: 8192 })).toBe('100%')
  })

  it('returns null when contextWindow is missing', () => {
    expect(formatContextUsage({ totalTokens: 100, contextWindow: undefined })).toBeNull()
  })

  it('returns null when totalTokens is missing', () => {
    expect(formatContextUsage({ totalTokens: undefined, contextWindow: 8192 })).toBeNull()
  })

  it('returns 0% for zero tokens', () => {
    expect(formatContextUsage({ totalTokens: 0, contextWindow: 8192 })).toBe('0%')
  })
})
