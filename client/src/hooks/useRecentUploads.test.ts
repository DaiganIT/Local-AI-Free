import { describe, it, expect } from 'vitest'
import { flattenFiles } from './useRecentUploads'
import type { AgentFolderNode } from '#/lib/types'

function file(id: string, name: string): AgentFolderNode {
  return { id, name, kind: 'file' }
}

function dir(name: string, children: AgentFolderNode[]): AgentFolderNode {
  return { id: name, name, kind: 'directory', children }
}

describe('flattenFiles', () => {
  it('returns a single file node', () => {
    const node = file('a/b.txt', 'b.txt')
    expect(flattenFiles(node)).toEqual([node])
  })

  it('returns [] for a directory with no children', () => {
    expect(flattenFiles(dir('root', []))).toEqual([])
  })

  it('returns [] for a tree with only directories', () => {
    const tree = dir('root', [dir('sub', [dir('deep', [])])])
    expect(flattenFiles(tree)).toEqual([])
  })

  it('flattens files from nested directories', () => {
    const f1 = file('uploads/a.txt', 'a.txt')
    const f2 = file('uploads/b.txt', 'b.txt')
    const f3 = file('docs/c.txt', 'c.txt')
    const tree = dir('root', [
      dir('uploads', [f1, f2]),
      dir('docs', [f3]),
    ])
    expect(flattenFiles(tree)).toEqual([f1, f2, f3])
  })

  it('returns all files when there are fewer than MAX_RECENT', () => {
    const files = [file('a', 'a'), file('b', 'b')]
    const tree = dir('root', files)
    expect(flattenFiles(tree)).toHaveLength(2)
  })

  it('returns more than 5 files (slice is done in the hook, not here)', () => {
    const files = Array.from({ length: 8 }, (_, i) => file(`f${i}`, `f${i}.txt`))
    const tree = dir('root', files)
    expect(flattenFiles(tree)).toHaveLength(8)
  })
})
