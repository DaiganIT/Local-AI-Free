import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import { createWorkspacesDatabase } from "../src/workspaces-db.js";
import Database from "better-sqlite3";
import { writeFileSync, existsSync, realpathSync, mkdirSync } from "fs";
import { join } from "path";
import { Buffer } from "buffer";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe("upload-agent-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(mkdirSync).mockClear();
  });

  it("returns error when agentId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { fileName: "report.txt", content: "hello" },
      id: "ua-1",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: agentId");
  });

  it("returns error when fileName is missing", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, content: "hello" },
      id: "ua-2",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: fileName");
  });

  it("returns error when content is missing", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "report.txt" },
      id: "ua-3",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: content");
  });

  it("allows empty string content (nullable)", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const basePath = "/tmp/test-upload";

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "empty.txt", content: "" },
      id: "ua-4",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBeUndefined();
    expect(response.data).toMatchObject({ name: "empty.txt", size: 0 });
  });

  it("returns error when agent does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: "nope", fileName: "report.txt", content: "hello" },
      id: "ua-5",
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
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "report.txt", content: "hello" },
      id: "ua-6",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("rejects fileName with path traversal ..", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "../../../etc/malicious", content: "pwned" },
      id: "ua-7",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("rejects absolute fileName", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "/tmp/malicious", content: "pwned" },
      id: "ua-8",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("saves file to uploads/ dir and returns { path, name, size }", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "report.txt", content: "Hello, world!" },
      id: "ua-9",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    // Should write to uploads/report.txt inside agent dir
    expect(writeFileSync).toHaveBeenCalledWith(
      join(agentDir, "uploads", "report.txt"),
      "Hello, world!",
      "utf-8",
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/report.txt",
      name: "report.txt",
      size: 13,
    });
  });

  it("creates the uploads/ directory if it does not exist", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";
    const agentDir = join(basePath, ".agents", "pa-1");

    // existsSync returns false for the uploads dir, true for agent dir
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockImplementation((p: string) => {
      // agent dir exists, but uploads dir does not
      return !p.toString().includes("uploads");
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "data.csv", content: "a,b,c" },
      id: "ua-10",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    // Should mkdir the uploads dir with recursive: true
    expect(mkdirSync).toHaveBeenCalledWith(
      join(agentDir, "uploads"),
      { recursive: true },
    );
  });

  it("returns error when fileName resolves outside via symlink", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === agentDir) return agentDir;
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return p.toString().includes("evil-link") || p.toString() === agentDir;
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "evil-link", content: "pwned" },
      id: "ua-11",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("writes binary file from base64 content with mimeType", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    // A tiny 1x1 red PNG in base64
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/TQBcNTh/AAAAC0lEQVR4nGNgIAWY";
    const decodedBuffer = Buffer.from(pngBase64, "base64");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "photo.png", content: pngBase64, mimeType: "image/png" },
      id: "ua-12",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    // Should write Buffer (decoded base64), not a UTF-8 string
    expect(writeFileSync).toHaveBeenCalledWith(
      join(agentDir, "uploads", "photo.png"),
      decodedBuffer,
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/photo.png",
      name: "photo.png",
      size: decodedBuffer.length,
      mimeType: "image/png",
    });
  });

  it("writes text file without mimeType (backward compat)", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-upload";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-agent-file",
      payload: { agentId: agent.id, fileName: "notes.txt", content: "plain text" },
      id: "ua-13",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    // Should still write as UTF-8 string when no mimeType
    expect(writeFileSync).toHaveBeenCalledWith(
      join(agentDir, "uploads", "notes.txt"),
      "plain text",
      "utf-8",
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/notes.txt",
      name: "notes.txt",
      size: 10,
    });
    expect(response.data).not.toHaveProperty("mimeType");
  });
});

describe("upload-workspace-file action", () => {
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
    vi.mocked(mkdirSync).mockClear();
  });

  it("returns error when workspaceId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { fileName: "report.txt", content: "hello" },
      id: "uw-1",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: workspaceId");
  });

  it("returns error when fileName is missing", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, content: "hello" },
      id: "uw-2",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: fileName");
  });

  it("returns error when content is missing", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "report.txt" },
      id: "uw-3",
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
      action: "upload-workspace-file",
      payload: { workspaceId: "unknown-id", fileName: "report.txt", content: "hello" },
      id: "uw-4",
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
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "report.txt", content: "hello" },
      id: "uw-5",
      send,
      db,
      chatResponse,
      wdb,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("rejects fileName with path traversal ..", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "../../../etc/malicious", content: "pwned" },
      id: "uw-6",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("rejects absolute fileName", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "/tmp/malicious", content: "pwned" },
      id: "uw-7",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("saves file to uploads/ dir and returns { path, name, size }", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "notes.md", content: "# Notes" },
      id: "uw-8",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(workspaceDir, "uploads", "notes.md"),
      "# Notes",
      "utf-8",
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/notes.md",
      name: "notes.md",
      size: 7,
    });
  });

  it("creates the uploads/ directory if it does not exist", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return !p.toString().includes("uploads");
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "data.csv", content: "a,b,c" },
      id: "uw-9",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(mkdirSync).toHaveBeenCalledWith(
      join(workspaceDir, "uploads"),
      { recursive: true },
    );
  });

  it("returns error when fileName resolves outside via symlink", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === workspaceDir) return workspaceDir;
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return p.toString().includes("evil-link") || p.toString() === workspaceDir;
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "evil-link", content: "pwned" },
      id: "uw-10",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("writes binary file from base64 content with mimeType", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/TQBcNTh/AAAAC0lEQVR4nGNgIAWY";
    const decodedBuffer = Buffer.from(pngBase64, "base64");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "photo.png", content: pngBase64, mimeType: "image/png" },
      id: "uw-11",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(workspaceDir, "uploads", "photo.png"),
      decodedBuffer,
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/photo.png",
      name: "photo.png",
      size: decodedBuffer.length,
      mimeType: "image/png",
    });
  });

  it("writes text file without mimeType (backward compat)", () => {
    const workspace = wdb.createWorkspace({ name: "My Project" });
    const basePath = "/tmp/test-upload-ws";
    const workspaceDir = join(basePath, ".workspaces", workspace.path);

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "upload-workspace-file",
      payload: { workspaceId: workspace.id, fileName: "notes.txt", content: "plain text" },
      id: "uw-12",
      send,
      db,
      chatResponse,
      wdb,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(workspaceDir, "uploads", "notes.txt"),
      "plain text",
      "utf-8",
    );

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      path: "uploads/notes.txt",
      name: "notes.txt",
      size: 10,
    });
    expect(response.data).not.toHaveProperty("mimeType");
  });
});
