import { existsSync, readdirSync, realpathSync } from "fs";
import { join, relative, sep } from "path";
import { isContainedIn } from "./path-security.js";

/** One node under an agent workspace (readable path under `.agents/<alias>/`). */
export interface AgentFolderNode {
  /** Stable id: relative POSIX path from the agent root (`AGENTS.md`, `subdir/x`). */
  id: string;
  name: string;
  kind: "file" | "directory";
  children?: AgentFolderNode[];
}

export interface ListAgentFolderOptions {
  maxDepth?: number;
  maxNodes?: number;
}

const DEFAULTS: Required<ListAgentFolderOptions> = {
  maxDepth: 32,
  maxNodes: 4000,
};


/**
 * Recursive listing of files and directories under agentDir.
 * Symlinks are skipped. Paths outside the resolved agent root after realpath are ignored.
 */
export function listAgentWorkspaceTree(
  agentDirAbsolute: string,
  options?: ListAgentFolderOptions,
): AgentFolderNode[] {
  const limits = { ...DEFAULTS, ...options };
  const counter = { n: 0 };

  try {
    if (!existsSync(agentDirAbsolute)) return [];
    const rootReal = realpathSync(agentDirAbsolute);
    return readEntries(rootReal, rootReal, counter, limits, 0);
  } catch {
    return [];
  }
}

export function workspaceRootTree(agentAliasDisplay: string, children: AgentFolderNode[]): AgentFolderNode {
  return {
    id: ".",
    name: agentAliasDisplay,
    kind: "directory",
    children,
  };
}

function readEntries(
  rootReal: string,
  currentAbs: string,
  counter: { n: number },
  limits: Required<ListAgentFolderOptions>,
  depth: number,
): AgentFolderNode[] {
  if (depth > limits.maxDepth || counter.n >= limits.maxNodes) return [];

  let entries;
  try {
    entries = readdirSync(currentAbs, { withFileTypes: true });
  } catch {
    return [];
  }

  const sorted = [...entries].sort((a, b) => {
    const da = a.isDirectory() ? 0 : 1;
    const db = b.isDirectory() ? 0 : 1;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const nodes: AgentFolderNode[] = [];

  for (const ent of sorted) {
    if (counter.n >= limits.maxNodes) break;
    if (ent.name === "." || ent.name === "..") continue;
    if (ent.isSymbolicLink()) continue;

    const childAbs = join(currentAbs, ent.name);

    let childReal: string;
    try {
      childReal = realpathSync(childAbs);
    } catch {
      continue;
    }

    if (!isContainedIn(rootReal, childReal)) continue;

    const baseRel =
      relative(rootReal, childReal).split(sep).join("/") || ent.name;

    if (ent.isDirectory()) {
      counter.n++;
      const children = readEntries(rootReal, childReal, counter, limits, depth + 1);
      nodes.push({
        id: baseRel === ent.name ? ent.name : baseRel,
        name: ent.name,
        kind: "directory",
        children,
      });
    } else if (ent.isFile()) {
      counter.n++;
      nodes.push({
        id: baseRel === ent.name ? ent.name : baseRel,
        name: ent.name,
        kind: "file",
      });
    }
  }

  return nodes;
}
