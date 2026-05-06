import { useAgentFolderTree } from './useAgentFolderTree'
import type { AgentFolderNode } from '#/lib/types'

const MAX_RECENT = 5

/** Flatten all file-kind leaf nodes from a folder tree node. Exported for testing. */
export function flattenFiles(node: AgentFolderNode): AgentFolderNode[] {
  if (node.kind === 'file') return [node]
  return (node.children ?? []).flatMap(flattenFiles)
}

/**
 * Returns the last `MAX_RECENT` files from the agent's workspace folder tree.
 * Reuses the same query cache as `AgentWorkspaceExplorer` — no extra fetch.
 */
export function useRecentUploads(agentId: string) {
  const { data, ...rest } = useAgentFolderTree(agentId)

  const files: AgentFolderNode[] = data
    ? flattenFiles(data.tree).slice(-MAX_RECENT)
    : []

  return { files, ...rest }
}
