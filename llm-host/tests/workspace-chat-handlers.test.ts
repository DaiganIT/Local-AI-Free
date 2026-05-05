import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRequest } from "../src/request-handler.js";
import type { AgentResponse } from "../src/handlers/workspace-chat-handlers.js";
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

describe("workspace-chat handlers", () => {
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

  it("returns error when send-workspace-message is missing workspaceChatId", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { agentId: agent.id, prompt: "Hello" },
      id: "wsm-1",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: workspaceChatId");
  });
  it("returns error when send-workspace-message is missing prompt", async () => {
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, agentId: "some-agent" },
      id: "wsm-2",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: prompt");
  });
  it("returns error when send-workspace-message is missing agentIds", async () => {
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello" },
      id: "wsm-3",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("missing required field: agentIds");
  });
  it("returns error when send-workspace-message agentIds is empty", async () => {
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [] },
      id: "wsm-3b",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("agentIds must be a non-empty array");
  });
  it("returns error when send-workspace-message agent does not exist", async () => {
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: ["non-existent"] },
      id: "wsm-4",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("agent not found: non-existent");
  });
  it("returns error when send-workspace-message chat does not exist", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: "non-existent", prompt: "Hello", agentIds: [agent.id] },
      id: "wsm-5",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace chat not found: non-existent");
  });
  it("stores user message, runs agent, stores agent response, returns result", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "Hello back!", promptTokens: 10, completionTokens: 5 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent.id] },
      id: "wsm-6",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // Filter for the final response message (streaming adds workspace_agent_start/end)
    const responseMessages = result.filter((m) => (m as any).type === "response");
    expect(responseMessages.length).toBe(1);
    const response = responseMessages[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      responses: [{ response: "Hello back!", agentId: agent.id }],
      workspaceChatId: chat.id,
    });

    // Verify messages were persisted
    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    expect(chatResult!.messages[0].senderType).toBe("user");
    expect(chatResult!.messages[0].content).toBe("Hello");
    expect(chatResult!.messages[1].senderType).toBe("agent");
    expect(chatResult!.messages[1].senderId).toBe(agent.id);
    expect(chatResult!.messages[1].content).toBe("Hello back!");
    expect(chatResult!.messages[1].modelUsed).toBe("llama3.2");
  });
  it("persists token counts in workspace messages", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });
    chatResponse.mockResolvedValue({ content: "Hi!", promptTokens: 42, completionTokens: 8 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent.id] },
      id: "wsm-9",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(2);
    const agentMsg = chatResult!.messages[1];
    expect(agentMsg.promptTokens).toBe(42);
    expect(agentMsg.completionTokens).toBe(8);
    expect(agentMsg.totalTokens).toBe(50);

    // Token totals on the chat should be updated
    expect(chatResult!.chat.totalPromptTokens).toBe(42);
    expect(chatResult!.chat.totalCompletionTokens).toBe(8);
    expect(chatResult!.chat.totalTokens).toBe(50);
  });
  it("strips thinking blocks from workspace messages in history", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    // Pre-populate with an agent message that has thinking blocks
    wchatDb.addMessage({
      workspaceChatId: chat.id,
      senderType: "agent",
      senderId: "other-agent",
      content: "<think>Hmm let me think...</think>The answer is 42",
      modelUsed: "mistral",
    });

    chatResponse.mockResolvedValue({ content: "I agree!", promptTokens: 5, completionTokens: 3 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Is that right?", agentIds: [agent.id] },
      id: "wsm-11",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // The thinking block should be stripped when building conversation history
    // Plus the user message added to in-memory history
    expect(chatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "assistant", content: "The answer is 42" },
          { role: "user", content: "Is that right?" },
        ],
      }),
    );
  });
  it("returns error when wchatDb is not available", async () => {
    const agent = db.createAgent({ name: "Helper", model: "llama3.2" });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: "some-id", prompt: "Hello", agentIds: [agent.id] },
      id: "wsm-14",
      send,
      db,
      chatResponse,
      wdb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("workspace chats database not available");
  });
  it("runs multiple agents sequentially and returns all responses", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "First answer", promptTokens: 10, completionTokens: 5 })
      .mockResolvedValueOnce({ content: "Second answer", promptTokens: 20, completionTokens: 10 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent1.id, agent2.id] },
      id: "wsm-multi-1",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // Filter for the final response message (streaming adds workspace_agent_start/end)
    const responseMessages = result.filter((m) => (m as any).type === "response");
    expect(responseMessages.length).toBe(1);
    const response = responseMessages[0] as Record<string, unknown>;
    expect(response.data).toMatchObject({
      responses: [
        { response: "First answer", agentId: agent1.id },
        { response: "Second answer", agentId: agent2.id },
      ],
      workspaceChatId: chat.id,
    });

    // Verify messages were persisted: 1 user + 2 agent responses
    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(3);
    expect(chatResult!.messages[0].senderType).toBe("user");
    expect(chatResult!.messages[1].senderType).toBe("agent");
    expect(chatResult!.messages[1].senderId).toBe(agent1.id);
    expect(chatResult!.messages[2].senderType).toBe("agent");
    expect(chatResult!.messages[2].senderId).toBe(agent2.id);
  });
  it("three agents each see only the user message (parallel)", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const agent3 = db.createAgent({ name: "Agent 3", model: "phi3" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "A1", promptTokens: 5, completionTokens: 2 })
      .mockResolvedValueOnce({ content: "A2", promptTokens: 10, completionTokens: 4 })
      .mockResolvedValueOnce({ content: "A3", promptTokens: 15, completionTokens: 6 });

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent1.id, agent2.id, agent3.id] },
      id: "wsm-multi-3",
      send: () => {},
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    // All agents see only [user] — no other agent responses
    for (let i = 1; i <= 3; i++) {
      expect(chatResponse).toHaveBeenNthCalledWith(i, expect.objectContaining({
        messages: [{ role: "user", content: "Go" }],
      }));
    }
  });
  it("parallel: partial failures — successful agents still return results", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const agent3 = db.createAgent({ name: "Agent 3", model: "phi3" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "A1 ok", promptTokens: 10, completionTokens: 5 })
      .mockRejectedValueOnce(new Error("Agent 2 ollama down"))
      .mockResolvedValueOnce({ content: "A3 ok", promptTokens: 15, completionTokens: 8 });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Test", agentIds: [agent1.id, agent2.id, agent3.id] },
      id: "wsm-parallel-fail",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const responseMessages = result.filter((m) => (m as any).type === "response");
    expect(responseMessages).toHaveLength(1);
    const response = responseMessages[0] as Record<string, unknown>;
    const data = response.data as Record<string, unknown>;

    // Successful agents should be in responses (order may vary due to parallel execution)
    const responses = data.responses as AgentResponse[];
    const responseAgentIds = responses.map((r) => r.agentId);
    expect(responseAgentIds).toContain(agent1.id);
    expect(responseAgentIds).toContain(agent3.id);
    expect(responseAgentIds).not.toContain(agent2.id);

    // Failed agent should be in errors
    const errors = data.errors as Array<{ agentId: string; message: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0].agentId).toBe(agent2.id);
    expect(errors[0].message).toBe("Agent 2 ollama down");

    // Verify only successful agents' responses were persisted
    const chatResult = wchatDb.getChat(chat.id);
    const agentMessages = chatResult!.messages.filter((m) => m.senderType === "agent");
    const persistedAgentIds = agentMessages.map((m) => m.senderId);
    expect(persistedAgentIds).toContain(agent1.id);
    expect(persistedAgentIds).toContain(agent3.id);
    expect(persistedAgentIds).not.toContain(agent2.id);
  });
  it("validates all agents exist before running any", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const result: unknown[] = [];
    const send = (data: unknown) => result.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent1.id, "non-existent"] },
      id: "wsm-multi-6",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    expect(result.length).toBe(1);
    const response = result[0] as Record<string, unknown>;
    expect(response.error).toBe("agent not found: non-existent");

    // No messages should be persisted
    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(0);
  });
  it("emits workspace_agent_start/end wrapper events around each agent's turn", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse
      .mockResolvedValueOnce({ content: "A1", promptTokens: 5, completionTokens: 2 })
      .mockResolvedValueOnce({ content: "A2", promptTokens: 10, completionTokens: 4 });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent1.id, agent2.id] },
      id: "ws-stream-1",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const streamMessages = sent.filter((m) => (m as any).type === "stream");

    const agentStarts = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_start");
    const agentEnds = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_end");

    expect(agentStarts).toHaveLength(2);
    expect(agentEnds).toHaveLength(2);

    expect(agentStarts[0]).toMatchObject({
      type: "stream",
      id: "ws-stream-1",
      event: { type: "workspace_agent_start", agentId: agent1.id, agentName: "Agent 1" },
    });
    expect(agentStarts[1]).toMatchObject({
      type: "stream",
      id: "ws-stream-1",
      event: { type: "workspace_agent_start", agentId: agent2.id, agentName: "Agent 2" },
    });

    expect(agentEnds[0]).toMatchObject({
      type: "stream",
      id: "ws-stream-1",
      event: { type: "workspace_agent_end", agentId: agent1.id },
    });
    expect(agentEnds[1]).toMatchObject({
      type: "stream",
      id: "ws-stream-1",
      event: { type: "workspace_agent_end", agentId: agent2.id },
    });

    // With parallel execution, all starts fire before any ends
    // Verify all start/end events are present (order may vary within starts/ends)
    const eventTypes = streamMessages.map((m) => (m as any).event.type);
    const wrapperEventTypes = eventTypes.filter(t => t === "workspace_agent_start" || t === "workspace_agent_end");
    expect(wrapperEventTypes).toContain("workspace_agent_start");
    expect(wrapperEventTypes).toContain("workspace_agent_end");
    expect(wrapperEventTypes).toHaveLength(4);
  });
  it("final workspace response is still sent after streaming events", async () => {
    const agent1 = db.createAgent({ name: "Agent 1", model: "llama3.2" });
    const agent2 = db.createAgent({ name: "Agent 2", model: "mistral" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const streamingChatResponse = vi.fn()
      .mockImplementationOnce(async (input: any) => {
        if (input.onEvent) {
          input.onEvent({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "Partial", contentIndex: 0 },
          });
        }
        return { content: "Full A1", promptTokens: 10, completionTokens: 5 };
      })
      .mockImplementationOnce(async () => ({ content: "Full A2", promptTokens: 15, completionTokens: 8 }));

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent1.id, agent2.id] },
      id: "ws-stream-3",
      send,
      db,
      chatResponse: streamingChatResponse,
      wdb,
      wchatDb,
    });

    const responseMessages = sent.filter((m) => (m as any).type === "response");
    expect(responseMessages).toHaveLength(1);
    expect(responseMessages[0]).toMatchObject({
      type: "response",
      id: "ws-stream-3",
      data: {
        responses: [
          { response: "Full A1", agentId: agent1.id },
          { response: "Full A2", agentId: agent2.id },
        ],
        workspaceChatId: chat.id,
      },
    });

    // Messages should be persisted
    const chatResult = wchatDb.getChat(chat.id);
    expect(chatResult!.messages).toHaveLength(3); // user + 2 agents
  });
  it("workspace streaming with single agent emits wrapper events", async () => {
    const agent = db.createAgent({ name: "Solo Agent", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    chatResponse.mockResolvedValue({ content: "Solo answer", promptTokens: 5, completionTokens: 3 });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Hello", agentIds: [agent.id] },
      id: "ws-stream-4",
      send,
      db,
      chatResponse,
      wdb,
      wchatDb,
    });

    const streamMessages = sent.filter((m) => (m as any).type === "stream");

    const agentStarts = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_start");
    const agentEnds = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_end");

    expect(agentStarts).toHaveLength(1);
    expect(agentEnds).toHaveLength(1);
    expect(agentStarts[0]).toMatchObject({
      event: { type: "workspace_agent_start", agentId: agent.id, agentName: "Solo Agent" },
    });
    expect(agentEnds[0]).toMatchObject({
      event: { type: "workspace_agent_end", agentId: agent.id },
    });
  });
  it("emits workspace_agent_end even when agent fails mid-stream", async () => {
    const agent = db.createAgent({ name: "Failing Agent", model: "llama3.2" });
    const ws = wdb.createWorkspace({ name: "Team" });
    const chat = wchatDb.createChat({ workspaceId: ws.id });

    const failingChatResponse = vi.fn().mockImplementationOnce(async (input: any) => {
      if (input.onEvent) {
        input.onEvent({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Partial", contentIndex: 0 },
        });
      }
      throw new Error("Agent exploded");
    });

    const sent: unknown[] = [];
    const send = (data: unknown) => sent.push(data);

    await handleRequest({
      action: "send-workspace-message",
      payload: { workspaceChatId: chat.id, prompt: "Go", agentIds: [agent.id] },
      id: "ws-stream-err-1",
      send,
      db,
      chatResponse: failingChatResponse,
      wdb,
      wchatDb,
    });

    const streamMessages = sent.filter((m) => (m as any).type === "stream");

    // Should still have workspace_agent_start and workspace_agent_end
    const agentStarts = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_start");
    const agentEnds = streamMessages.filter((m) => (m as any).event.type === "workspace_agent_end");

    expect(agentStarts).toHaveLength(1);
    expect(agentEnds).toHaveLength(1);

    // The response should contain the error in errors array
    const responseMessages = sent.filter((m) => (m as any).type === "response");
    expect(responseMessages).toHaveLength(1);
    expect(responseMessages[0]).toMatchObject({
      type: "response",
      id: "ws-stream-err-1",
      data: {
        responses: [],
        errors: [{ agentId: agent.id, message: "Agent exploded" }],
        workspaceChatId: chat.id,
      },
    });
  });
});
