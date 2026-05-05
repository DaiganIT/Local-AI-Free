import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import Database from "better-sqlite3";
import {
  existsSync,
  realpathSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe("read-workspace-file action", () => {
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
    vi.mocked(readFileSync).mockClear();
    vi.mocked(statSync).mockClear();
  });

  it("returns error when workspaceId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: { path: "README.md" },
      id: "rwf-1",
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
      action: "read-workspace-file",
      payload: { workspaceId: workspace.id },
      id: "rwf-2",
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
      action: "read-workspace-file",
      payload: { workspaceId: "unknown-id", path: "README.md" },
      id: "rwf-3",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("workspace not found");
  });

  it("returns error when agentFolderBasePath is not configured", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: { workspaceId: workspace.id, path: "README.md" },
      id: "rwf-4",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("reads a text file and returns content + kind=text", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    vi.mocked(readFileSync).mockReturnValue("Hello, workspace!");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: { workspaceId: workspace.id, path: "README.md" },
      id: "rwf-5",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      content: "Hello, workspace!",
      kind: "text",
      path: "README.md",
    });
  });

  it("rejects path traversal with ..", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "../../../etc/passwd",
      },
      id: "rwf-6",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("rejects absolute paths", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "/etc/passwd",
      },
      id: "rwf-7",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("returns error when file does not exist", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";
    vi.mocked(existsSync).mockReturnValue(false);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "nonexistent.txt",
      },
      id: "rwf-8",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("file not found");
  });

  it("returns kind=image for image extensions", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("fake-image-data"));

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "screenshot.png",
      },
      id: "rwf-9",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).kind).toBe("image");
    expect((response.data as Record<string, unknown>).path).toBe("screenshot.png");
  });

  it("returns error when path resolves outside the workspace directory", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    // Simulate a symlink that points outside
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === workspaceDir) return workspaceDir;
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "evil-link",
      },
      id: "rwf-10",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("returns error when path is a directory, not a file", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-read";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    } as any);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "src",
      },
      id: "rwf-11",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not a file");
  });
});

describe("write-workspace-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let wdb: ReturnType<typeof createWorkspacesDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    wdb = createWorkspacesDatabase(new Database(":memory:"));
    chatResponse = vi.fn();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
  });

  it("returns error when workspaceId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: { path: "notes.txt", content: "hello" },
      id: "wwf-1",
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
      action: "write-workspace-file",
      payload: { workspaceId: workspace.id, content: "hello" },
      id: "wwf-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: path");
  });

  it("returns error when content is missing", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: { workspaceId: workspace.id, path: "notes.txt" },
      id: "wwf-3",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: content");
  });

  it("returns error when workspace does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: "unknown-id",
        path: "notes.txt",
        content: "hello",
      },
      id: "wwf-4",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("workspace not found");
  });

  it("returns error when agentFolderBasePath is not configured", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "notes.txt",
        content: "hello",
      },
      id: "wwf-5",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("rejects path traversal with ..", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-write";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "../../../etc/malicious",
        content: "pwned",
      },
      id: "wwf-6",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("rejects absolute paths", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-write";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "/tmp/malicious",
        content: "pwned",
      },
      id: "wwf-7",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("writes a file within the workspace directory", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-write";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "notes.txt",
        content: "Hello, workspace!",
      },
      id: "wwf-8",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(workspaceDir, "notes.txt"),
      "Hello, workspace!",
      "utf-8",
    );
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("writes a file in a subdirectory", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-write";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "src/index.ts",
        content: "export {}",
      },
      id: "wwf-9",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(workspaceDir, "src", "index.ts"),
      "export {}",
      "utf-8",
    );
  });

  it("returns error when path resolves outside the workspace directory", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-ws-write";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    // Simulate a symlink that points outside
    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === workspaceDir) return workspaceDir;
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return (
        p.toString().includes("evil-link") || p.toString() === workspaceDir
      );
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-workspace-file",
      payload: {
        workspaceId: workspace.id,
        path: "evil-link",
        content: "pwned",
      },
      id: "wwf-10",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });
});
