import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import Database from "better-sqlite3";
import { existsSync, realpathSync, readFileSync, statSync, mkdirSync, writeFileSync } from "fs";
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

describe("read-agent-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(statSync).mockClear();
  });

  it("returns error when agentId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { path: "AGENTS.md" },
      id: "rf-1",
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
      action: "read-agent-file",
      payload: { agentId: agent.id },
      id: "rf-2",
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
      action: "read-agent-file",
      payload: { agentId: "nope", path: "AGENTS.md" },
      id: "rf-3",
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
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "AGENTS.md" },
      id: "rf-4",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("reads a text file and returns content + kind=text", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";
    const agentDir = join(basePath, ".agents", "pa-1");
    const filePath = join(agentDir, "AGENTS.md");

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
    vi.mocked(readFileSync).mockReturnValue("You are a pirate.");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "AGENTS.md" },
      id: "rf-5",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      content: "You are a pirate.",
      kind: "text",
      path: "AGENTS.md",
    });
  });

  it("rejects path traversal with ..", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "../../../etc/passwd" },
      id: "rf-6",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("rejects absolute paths", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "/etc/passwd" },
      id: "rf-7",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("returns error when file does not exist", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";
    vi.mocked(existsSync).mockReturnValue(false);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "nonexistent.txt" },
      id: "rf-8",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("file not found");
  });

  it("returns kind=image for image extensions", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("fake-image-data"));

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "screenshot.png" },
      id: "rf-9",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).kind).toBe("image");
    expect((response.data as Record<string, unknown>).path).toBe("screenshot.png");
  });

  it("returns kind=text for .md files", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-read";

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
    vi.mocked(readFileSync).mockReturnValue("# Hello");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "read-agent-file",
      payload: { agentId: agent.id, path: "notes.md" },
      id: "rf-10",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect((response.data as Record<string, unknown>).kind).toBe("text");
  });
});
