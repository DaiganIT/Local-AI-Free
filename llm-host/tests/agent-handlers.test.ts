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

describe("agent handlers", () => {
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

  it("creates an agent when action is create-agent", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: { name: "test-agent", model: "llama3.2" },
      id: "1",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ id: "1" });
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ name: "test-agent", alias: "test-agent", model: "llama3.2", status: "idle" });
  });
  it("creates agent folder when agentFolderBasePath is provided", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    const basePath = "/tmp/test-agents";

    handleRequest({
      action: "create-agent",
      payload: { name: "PA 1", model: "llama3.2" },
      id: "folder-1",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(mkdirSync).toHaveBeenCalledWith(
      join(basePath, ".agents", "pa-1"),
      { recursive: true },
    );
  });
  it("does not create agent folder when agentFolderBasePath is not provided", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: { name: "PA 1", model: "llama3.2" },
      id: "folder-2",
      send,
      db,
      chatResponse,
    });

    expect(mkdirSync).not.toHaveBeenCalled();
  });
  it("returns error when create-agent payload is missing name", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: { model: "llama3.2" },
      id: "2",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: name");
  });
  it("returns error when create-agent payload is missing model", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: { name: "test-agent" },
      id: "3",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: model");
  });
  it("lists agents when action is list-agents", () => {
    db.createAgent({ name: "agent-1", model: "llama3.2" });
    db.createAgent({ name: "agent-2", model: "phi3" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-agents",
      payload: {},
      id: "4",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as Array<unknown>).length).toBe(2);
  });
  it("uses default system prompt when AGENTS.md is not on disk", async () => {
    const agent = db.createAgent({ name: "test-agent", model: "llama3.2" });
    chatResponse.mockResolvedValue({ content: "Hi!" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-message",
      payload: { agentId: agent.id, prompt: "hello" },
      id: "default-sys",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "llama3.2",
        systemPrompt: expect.stringContaining("You are a helpful assistant."),
        prompt: "hello",
        messages: [],
      }),
    );
  });
  it("accepts metadata fields when create-agent", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: {
        name: "rich-agent",
        model: "llama3.2",
        tools: ["read", "bash"],
        skills: [{ name: "frontend-design", description: "UI design" }],
      },
      id: "19",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      name: "rich-agent",
      model: "llama3.2",
    });
    expect((response.data as Record<string, unknown>).tools).toEqual([
      "read", "bash",
    ]);
    expect((response.data as Record<string, unknown>).skills).toEqual([
      { name: "frontend-design", description: "UI design" },
    ]);
  });
  it("includes metadata in list-agents", () => {
    db.createAgent({
      name: "agent-a",
      model: "llama3.2",
      tools: ["bash"],
    });
    db.createAgent({ name: "agent-b", model: "phi3" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-agents",
      payload: {},
      id: "20",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    const agents = response.data as Array<Record<string, unknown>>;
    expect(agents).toHaveLength(2);
    const agentA = agents.find((a) => a.name === "agent-a")!;
    const agentB = agents.find((a) => a.name === "agent-b")!;
    expect(agentA.tools).toEqual(["bash"]);
    expect(agentB.tools).toBeNull();
  });
  it("deletes an agent when action is delete-agent", async () => {
    const agent = db.createAgent({ name: "To Delete", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent",
      payload: { agentId: agent.id },
      id: "21",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(db.getAgent(agent.id)).toBeUndefined();
  });
  it("deletes an agent AND its chats when action is delete-agent", async () => {
    const agent = db.createAgent({ name: "With Chats", model: "llama3.2" });
    const chat = chatDb.createChat({ agentId: agent.id, title: "Chat to delete" });
    chatDb.insertMessage({ chatId: chat.id, role: "user", content: "Hello", modelUsed: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent",
      payload: { agentId: agent.id },
      id: "22",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ success: true });
    expect(db.getAgent(agent.id)).toBeUndefined();
    expect(chatDb.getChat(chat.id)).toBeUndefined();
  });
  it("returns error when delete-agent agent does not exist", async () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "delete-agent",
      payload: { agentId: "non-existent" },
      id: "23",
      send,
      db,
      chatDb,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toContain("not found");
  });
  it("writes AGENTS.md when creating an agent with agentFolderBasePath", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    const basePath = "/tmp/test-agents";

    handleRequest({
      action: "create-agent",
      payload: { name: "PA 1", model: "llama3.2", instructions: "You are a coder." },
      id: "agents-md-1",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(basePath, ".agents", "pa-1", "AGENTS.md"),
      "You are a coder.",
      "utf-8",
    );
  });
  it("writes default AGENTS.md when instructions not provided", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    const basePath = "/tmp/test-agents";

    handleRequest({
      action: "create-agent",
      payload: { name: "PA 2", model: "llama3.2" },
      id: "agents-md-2",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(writeFileSync).toHaveBeenCalledWith(
      join(basePath, ".agents", "pa-2", "AGENTS.md"),
      "You are a helpful assistant.",
      "utf-8",
    );
  });
  it("does not write AGENTS.md when agentFolderBasePath is not set", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "create-agent",
      payload: { name: "PA 3", model: "llama3.2", instructions: "You are a coder." },
      id: "agents-md-3",
      send,
      db,
      chatResponse,
    });

    // writeFileSync should not have been called for AGENTS.md
    // (it may have been called for last-run.md in other tests, but not here)
    const calls = vi.mocked(writeFileSync).mock.calls;
    const agentsMdCalls = calls.filter(c => (c[0] as string).includes("AGENTS.md"));
    expect(agentsMdCalls).toHaveLength(0);
  });
  it("returns agent instructions from AGENTS.md via get-agent-instructions", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents";
    vi.mocked(readFileSync).mockReturnValue("You are a pirate.");

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "get-agent-instructions",
      payload: { agentId: agent.id },
      id: "instr-1",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ instructions: "You are a pirate." });
  });
  it("returns default instructions when AGENTS.md does not exist", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });
    const basePath = "/tmp/test-agents";
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error("ENOENT"); });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "get-agent-instructions",
      payload: { agentId: agent.id },
      id: "instr-2",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ instructions: "You are a helpful assistant." });
  });
  it("returns default instructions when agentFolderBasePath is not set", () => {
    const agent = db.createAgent({ name: "PA 1", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "get-agent-instructions",
      payload: { agentId: agent.id },
      id: "instr-3",
      send,
      db,
      chatResponse,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({ instructions: "You are a helpful assistant." });
  });
  it("returns workspace tree via list-agent-folder when base path is set", () => {
    const agent = db.createAgent({ name: "PA Tree", model: "llama3.2" });
    const spy = vi.spyOn(agentFolderTree, "listAgentWorkspaceTree").mockReturnValue([
      { id: "AGENTS.md", name: "AGENTS.md", kind: "file" },
    ]);
    const basePath = "/tmp/test-agents";
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-agent-folder",
      payload: { agentId: agent.id },
      id: "tree-1",
      send,
      db,
      chatResponse,
      agentFolderBasePath: basePath,
    });

    expect(spy).toHaveBeenCalledWith(join(basePath, ".agents", agent.alias));
    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    const data = response.data as Record<string, unknown>;
    const tree = data.tree as Record<string, unknown>;
    expect(tree.name).toBe(agent.alias);
    expect(tree.kind).toBe("directory");
    expect(tree.children).toEqual([{ id: "AGENTS.md", name: "AGENTS.md", kind: "file" }]);
    spy.mockRestore();
  });
  it("returns empty workspace tree via list-agent-folder when base path is not set", () => {
    const agent = db.createAgent({ name: "PA Tree 2", model: "llama3.2" });
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    handleRequest({
      action: "list-agent-folder",
      payload: { agentId: agent.id },
      id: "tree-2",
      send,
      db,
      chatResponse,
    });

    const response = result[0] as Record<string, unknown>;
    const tree = (response.data as Record<string, unknown>).tree as Record<string, unknown>;
    expect(tree.children).toEqual([]);
  });
  it("returns error when list-agent-folder misses agentId", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    handleRequest({
      action: "list-agent-folder",
      payload: {},
      id: "tree-e1",
      send,
      db,
      chatResponse,
      agentFolderBasePath: "/tmp/x",
    });
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: agentId");
  });
  it("returns error when list-agent-folder agent is unknown", () => {
    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);
    handleRequest({
      action: "list-agent-folder",
      payload: { agentId: "nope-id" },
      id: "tree-e2",
      send,
      db,
      chatResponse,
      agentFolderBasePath: "/tmp/x",
    });
    expect((result[0] as Record<string, unknown>).error).toContain("agent not found");
  });
});
