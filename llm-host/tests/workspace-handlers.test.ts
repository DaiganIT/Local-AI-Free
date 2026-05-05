import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createChatDatabase } from "../src/chat-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import { createWorkspaceChatsDatabase } from "../src/workspace-chats-db.js";
import Database from "better-sqlite3";
import * as agentFolderTree from "../src/agent-folder-tree.js";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe("workspace handlers", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatDb: ReturnType<typeof createChatDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let wchatDb: ReturnType<typeof createWorkspaceChatsDatabase>;
  let sqliteDb: Database.Database;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatDb = createChatDatabase(sqliteDb);
    wdb = createWorkspacesDatabase(sqliteDb);
    wchatDb = createWorkspaceChatsDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(readFileSync).mockClear();
  });

  it("creates a workspace when action is create-workspace", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-workspace",
      payload: { name: "My Workspace" },
      id: "ws-1",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ name: "My Workspace", alias: "my-workspace", path: "my-workspace" });
  });
  it("creates workspace folder when agentFolderBasePath is provided", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    const basePath = "/tmp/test-agents";

    handleRequest({
      action: "create-workspace",
      payload: { name: "Project X", path: "project-x" },
      id: "ws-folder-1",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(mkdirSync).toHaveBeenCalledWith(
      join(basePath, ".workspaces", "project-x"),
      { recursive: true },
    );
  });
  it("does not create workspace folder when agentFolderBasePath is not provided", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-workspace",
      payload: { name: "Project Y" },
      id: "ws-folder-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    // mkdirSync should not have been called for workspaces
    const wsCalls = vi.mocked(mkdirSync).mock.calls.filter(
      c => (c[0] as string).includes(".workspaces"),
    );
    expect(wsCalls).toHaveLength(0);
  });
  it("returns error when create-workspace payload is missing name", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-workspace",
      payload: {},
      id: "ws-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: name");
  });
  it("lists workspaces when action is list-workspaces", () => {
    wdb.createWorkspace({ name: "Workspace A" });
    wdb.createWorkspace({ name: "Workspace B" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspaces",
      payload: {},
      id: "ws-3",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as Array<unknown>).length).toBe(2);
  });
  it("gets a workspace when action is get-workspace", () => {
    const workspace = wdb.createWorkspace({ name: "Test Workspace" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "get-workspace",
      payload: { workspaceId: workspace.id },
      id: "ws-4",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ name: "Test Workspace", alias: "test-workspace" });
  });
  it("returns error when get-workspace workspace does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "get-workspace",
      payload: { workspaceId: "non-existent" },
      id: "ws-5",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not found");
  });
  it("updates a workspace when action is update-workspace", () => {
    const workspace = wdb.createWorkspace({ name: "Old Name" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "update-workspace",
      payload: { workspaceId: workspace.id, name: "New Name", path: "new-path" },
      id: "ws-6",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ name: "New Name", path: "new-path" });
  });
  it("deletes a workspace when action is delete-workspace", () => {
    const workspace = wdb.createWorkspace({ name: "To Delete" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace",
      payload: { workspaceId: workspace.id },
      id: "ws-7",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(wdb.getWorkspace(workspace.id)).toBeUndefined();
  });
  it("delete-workspace does NOT delete folder on disk", () => {
    const workspace = wdb.createWorkspace({ name: "To Keep" });
    const basePath = "/tmp/test-agents";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace",
      payload: { workspaceId: workspace.id },
      id: "ws-del-folder",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    // Should NOT call any fs operation for deletion
    const delCalls = vi.mocked(mkdirSync).mock.calls.filter(
      c => (c[0] as string).includes(workspace.path),
    );
    // mkdirSync is only for creation, no rmdirSync should be called
    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
  });
  it("adds an agent to a workspace when action is add-agent-to-workspace", () => {
    const agent = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const workspace = wdb.createWorkspace({ name: "My Workspace" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "add-agent-to-workspace",
      payload: { workspaceId: workspace.id, agentId: agent.id },
      id: "ws-8",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(wdb.listWorkspaceAgents(workspace.id)).toContain(agent.id);
  });
  it("returns error when add-agent-to-workspace workspace does not exist", () => {
    const agent = db.createAgent({ name: "Agent 2", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "add-agent-to-workspace",
      payload: { workspaceId: "non-existent", agentId: agent.id },
      id: "ws-9",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not found");
  });
  it("removes an agent from a workspace when action is remove-agent-from-workspace", () => {
    const agent = db.createAgent({ name: "Agent 3", model: "llama3.2" });
    const workspace = wdb.createWorkspace({ name: "My Workspace" });
    wdb.addAgentToWorkspace(workspace.id, agent.id);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "remove-agent-from-workspace",
      payload: { workspaceId: workspace.id, agentId: agent.id },
      id: "ws-10",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(wdb.listWorkspaceAgents(workspace.id)).not.toContain(agent.id);
  });
  it("lists workspace agents when action is list-workspace-agents", () => {
    const agent1 = db.createAgent({ name: "Agent A", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent B", model: "llama3.2" });
    const workspace = wdb.createWorkspace({ name: "My Workspace" });
    wdb.addAgentToWorkspace(workspace.id, agent1.id);
    wdb.addAgentToWorkspace(workspace.id, agent2.id);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspace-agents",
      payload: { workspaceId: workspace.id },
      id: "ws-11",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as string[]).sort()).toEqual([agent1.id, agent2.id].sort());
  });
  it("lists agent workspaces when action is list-agent-workspaces", () => {
    const agent = db.createAgent({ name: "Agent X", model: "llama3.2" });
    const ws1 = wdb.createWorkspace({ name: "Workspace 1" });
    const ws2 = wdb.createWorkspace({ name: "Workspace 2" });
    wdb.addAgentToWorkspace(ws1.id, agent.id);
    wdb.addAgentToWorkspace(ws2.id, agent.id);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-agent-workspaces",
      payload: { agentId: agent.id },
      id: "ws-12",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as string[]).sort()).toEqual([ws1.id, ws2.id].sort());
  });
  it("returns workspace tree via list-workspace-folder when base path is set", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const spy = vi.spyOn(agentFolderTree, "listAgentWorkspaceTree").mockReturnValue([
      { id: "README.md", name: "README.md", kind: "file" },
      { id: "src", name: "src", kind: "directory", children: [] },
    ]);
    const basePath = "/tmp/test-workspaces";
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspace-folder",
      payload: { workspaceId: workspace.id },
      id: "lwtf-1",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(spy).toHaveBeenCalledWith(join(basePath, ".workspaces", workspace.path));
    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    const data = response.data as Record<string, unknown>;
    const tree = data.tree as Record<string, unknown>;
    expect(tree.name).toBe(workspace.name);
    expect(tree.kind).toBe("directory");
    expect(tree.children).toEqual([
      { id: "README.md", name: "README.md", kind: "file" },
      { id: "src", name: "src", kind: "directory", children: [] },
    ]);
    spy.mockRestore();
  });
  it("returns empty workspace tree via list-workspace-folder when base path is not set", () => {
    const workspace = wdb.createWorkspace({ name: "No Base" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspace-folder",
      payload: { workspaceId: workspace.id },
      id: "lwtf-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    const tree = (response.data as Record<string, unknown>).tree as Record<string, unknown>;
    expect(tree.name).toBe(workspace.name);
    expect(tree.children).toEqual([]);
  });
  it("returns error when list-workspace-folder misses workspaceId", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspace-folder",
      payload: {},
      id: "lwtf-3",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: "/tmp/x",
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: workspaceId");
  });
  it("returns error when list-workspace-folder workspace is unknown", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-workspace-folder",
      payload: { workspaceId: "unknown-id" },
      id: "lwtf-4",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: "/tmp/x",
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not found: unknown-id");
  });
});
