import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import { createDatabase } from "../src/agents-db.js";
import Database from "better-sqlite3";
import { writeFileSync, existsSync, realpathSync } from "fs";
import { join } from "path";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe("write-agent-file action", () => {
  let db: ReturnType<typeof createDatabase>;
  let chatResponse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sqliteDb = new Database(":memory:");
    db = createDatabase(sqliteDb);
    chatResponse = vi.fn();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
  });

  it("returns error when agentId is missing", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { path: "notes.txt", content: "hello" },
      id: "wf-1",
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
      action: "write-agent-file",
      payload: { agentId: agent.id, content: "hello" },
      id: "wf-2",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: path");
  });

  it("returns error when content is missing", () => {
    const agent = db.createAgent({ name: "Test Agent", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "notes.txt" },
      id: "wf-3",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: content");
  });

  it("returns error when agent does not exist", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: "nope", path: "notes.txt", content: "hello" },
      id: "wf-4",
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
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "notes.txt", content: "hello" },
      id: "wf-5",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace not configured");
  });

  it("rejects path traversal with ..", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-write";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "../../../etc/malicious", content: "pwned" },
      id: "wf-6",
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
    const basePath = "/tmp/test-agents-write";

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "/tmp/malicious", content: "pwned" },
      id: "wf-7",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });

  it("writes a file within the agent workspace", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-write";
    const agentDir = join(basePath, ".agents", "pa-1");

    // Mock realpathSync for path confinement checks
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "notes.txt", content: "Hello, world!" },
      id: "wf-8",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(agentDir, "notes.txt"),
      "Hello, world!",
      "utf-8",
    );
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true, path: "notes.txt" });
  });

  it("writes a file in a subdirectory", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-write";
    const agentDir = join(basePath, ".agents", "pa-1");

    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "src/index.ts", content: "export {}" },
      id: "wf-9",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(agentDir, "src", "index.ts"),
      "export {}",
      "utf-8",
    );
  });

  it("returns error when path resolves outside the agent directory", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents-write";
    const agentDir = join(basePath, ".agents", "pa-1");

    // Simulate a symlink that points outside the agent dir
    vi.mocked(realpathSync).mockImplementation((p: string) => {
      if (p === agentDir) return agentDir; // agent dir resolves normally
      // The evil-link path resolves to /etc/evil-target (outside agent dir)
      if (p.includes("evil-link")) return "/etc/evil-target";
      return p;
    });
    // The evil-link path "exists" (as a symlink)
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return p.toString().includes("evil-link") || p.toString() === agentDir;
    });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "write-agent-file",
      payload: { agentId: agent.id, path: "evil-link", content: "pwned" },
      id: "wf-10",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("path not allowed");
  });
});
