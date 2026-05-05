import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import Database from "better-sqlite3";
import {
  existsSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe("delete-agent-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(statSync).mockClear();
    vi.mocked(unlinkSync).mockClear();
  });

  it("returns error when agentId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { path: "notes.txt" },
      id: "d1",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: agentId");
  });

  it("returns error when path is missing", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id },
      id: "d2",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: path");
  });

  it("returns error when agent does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: "nope", path: "notes.txt" },
      id: "d3",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("agent not found");
  });

  it("returns error when agentFolderBasePath is not configured", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "notes.txt" },
      id: "d4",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("deletes a file within the agent directory", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "notes.txt" },
      id: "d5",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(unlinkSync).toHaveBeenCalledWith(join(agentDir, "notes.txt"));
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("rejects path traversal with ..", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "../../../etc/passwd" },
      id: "d6",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("rejects absolute paths", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "/etc/passwd" },
      id: "d7",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("returns error when file does not exist", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";
    vi.mocked(existsSync).mockReturnValue(false);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "nonexistent.txt" },
      id: "d8",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("file not found");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("returns error when path is a directory", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => false, isDirectory: () => true } as any);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "src" },
      id: "d9",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not a file");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("returns error when symlink resolves outside the agent directory", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === agentDir) return agentDir;
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "evil-link" },
      id: "d10",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("rejects deletion of AGENTS.md", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-delete-agent";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent-file",
      payload: { agentId: agent.id, path: "AGENTS.md" },
      id: "d11",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("protected");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});

describe("delete-workspace-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    wdb = createWorkspacesDatabase(new Database(":memory:"));
    chatResponse = vi.fn();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(statSync).mockClear();
    vi.mocked(unlinkSync).mockClear();
  });

  it("returns error when workspaceId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { path: "notes.txt" },
      id: "dwf-1",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: workspaceId");
  });

  it("returns error when path is missing", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: workspace.id },
      id: "dwf-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: path");
  });

  it("returns error when workspace does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: "unknown-id", path: "notes.txt" },
      id: "dwf-3",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("workspace not found");
  });

  it("deletes a file within the workspace directory", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-delete-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: workspace.id, path: "notes.txt" },
      id: "dwf-4",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(unlinkSync).toHaveBeenCalledWith(join(workspaceDir, "notes.txt"));
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("rejects path traversal with ..", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-delete-ws";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: workspace.id, path: "../../../etc/passwd" },
      id: "dwf-5",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("returns error when agentFolderBasePath is not configured", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: workspace.id, path: "notes.txt" },
      id: "dwf-6",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("rejects deletion of AGENTS.md", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-delete-ws";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-workspace-file",
      payload: { workspaceId: workspace.id, path: "AGENTS.md" },
      id: "dwf-7",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("protected");
    expect(unlinkSync).not.toHaveBeenCalled();
  });
});
