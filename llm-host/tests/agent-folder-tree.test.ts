import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { listAgentWorkspaceTree, workspaceRootTree } from "../src/agent-folder-tree.js";

describe("listAgentWorkspaceTree", () => {
  let agentRoot: string;

  beforeEach(() => {
    agentRoot = mkdtempSync(join(tmpdir(), "llm-agents-workspace-test-"));
  });

  it("returns empty children for missing directory", () => {
    const missing = join(agentRoot, "nope");
    expect(listAgentWorkspaceTree(missing)).toEqual([]);
  });

  it("lists files and directories with stable ids relative to workspace root", () => {
    mkdirSync(join(agentRoot, "sub"), { recursive: true });
    writeFileSync(join(agentRoot, "AGENTS.md"), "hi");
    writeFileSync(join(agentRoot, "sub", "a.txt"), "");

    const nodes = listAgentWorkspaceTree(agentRoot);
    expect(nodes).toHaveLength(2);

    const agentsMd = nodes.find((n) => n.name === "AGENTS.md");
    const sub = nodes.find((n) => n.name === "sub");
    expect(agentsMd).toMatchObject({ id: "AGENTS.md", kind: "file" });
    expect(sub).toMatchObject({ kind: "directory" });
    expect(sub?.children).toHaveLength(1);
    expect(sub?.children?.[0]).toMatchObject({ id: "sub/a.txt", name: "a.txt", kind: "file" });
  });

  it("sorts directories before files lexicographically", () => {
    writeFileSync(join(agentRoot, "z.txt"), "");
    mkdirSync(join(agentRoot, "a-dir"));
    mkdirSync(join(agentRoot, "b-dir"));
    const nodes = listAgentWorkspaceTree(agentRoot);
    expect(nodes.map((n) => n.name)).toEqual(["a-dir", "b-dir", "z.txt"]);
  });

  it("skips symbolic links", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "llm-other-"));
    writeFileSync(join(otherDir, "outside.txt"), "");
    symlinkSync(join(otherDir, "outside.txt"), join(agentRoot, "link"));

    writeFileSync(join(agentRoot, "real.txt"), "");
    const nodes = listAgentWorkspaceTree(agentRoot);

    expect(nodes.map((n) => n.name).sort()).toEqual(["real.txt"]);
  });
});

describe("workspaceRootTree", () => {
  it("wraps children as a single virtual root node", () => {
    expect(
      workspaceRootTree("my-alias", [
        { id: "foo", name: "foo", kind: "file" },
      ]),
    ).toMatchObject({
      id: ".",
      name: "my-alias",
      kind: "directory",
      children: [{ id: "foo", name: "foo", kind: "file" }],
    });
  });
});
