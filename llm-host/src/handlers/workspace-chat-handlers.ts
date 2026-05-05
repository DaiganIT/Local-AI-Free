import type { AgentsDb } from "../agents-db.js";
import type { WorkspacesDb } from "../workspaces-db.js";
import type { WorkspaceChatsDb, WorkspaceMessageRow } from "../workspace-chats-db.js";
import type { AgentRunInput, AgentRunResult } from "../agent-runner.js";
import type { StreamEvent } from "../protocol.js";
import type { RequestTracker } from "../request-tracker.js";
import { validateRequired } from "../utils.js";
import { sendResponse } from "../send-response.js";
import { stripThinking, buildSystemPrompt, buildAttachmentHint, buildImageContents, resolveUploadsDir } from "./agent-prompt.js";
import { readFileSync } from "fs";
import { join } from "path";

interface AgentResponse {
  response: string;
  agentId: string;
}

/** Error info for a failed agent in a workspace chat response */
interface AgentError {
  agentId: string;
  message: string;
}

/** Response for a multi-agent workspace chat */
interface WorkspaceMessageResponse {
  responses: AgentResponse[];
  errors?: AgentError[];
  workspaceChatId: string;
}

export async function handleSendWorkspaceMessage(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  wchatDb: WorkspaceChatsDb | undefined,
  chatResponse: (input: AgentRunInput) => Promise<AgentRunResult>,
  contextLengthFor: ((model: string) => number | undefined) | undefined,
  agentFolderBasePath?: string,
  wdb?: WorkspacesDb,
  tracker?: RequestTracker,
): Promise<void> {
  if (!wchatDb) {
    sendResponse(send, id, undefined, "workspace chats database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceChatId", "prompt", "agentIds"]);
  if (err) { sendResponse(send, id, undefined, err); return; }

  const workspaceChatId = payload.workspaceChatId as string;
  const prompt = payload.prompt as string;
  const agentIds = payload.agentIds as string[];

  if (!Array.isArray(agentIds) || agentIds.length === 0) {
    sendResponse(send, id, undefined, "agentIds must be a non-empty array");
    return;
  }

  // Validate all agents exist upfront
  const agents = new Map<string, ReturnType<typeof db.getAgent>>();
  for (const agentId of agentIds) {
    const agent = db.getAgent(agentId);
    if (!agent) {
      sendResponse(send, id, undefined, `agent not found: ${agentId}`);
      return;
    }
    agents.set(agentId, agent);
  }

  const chatResult = wchatDb.getChat(workspaceChatId);
  if (!chatResult) {
    sendResponse(send, id, undefined, `workspace chat not found: ${workspaceChatId}`);
    return;
  }

  // Resolve the workspace directory so agents' tools operate in the shared area
  const workspace = wdb?.getWorkspace(chatResult.chat.workspaceId);
  const workspaceDir = (workspace && agentFolderBasePath)
    ? join(agentFolderBasePath, ".workspaces", workspace.path)
    : undefined;

  try {
    // Derive chat title from the first user message (truncated)
    if (chatResult.messages.length === 0) {
      const MAX_TITLE_LENGTH = 50;
      const title = prompt.length > MAX_TITLE_LENGTH
        ? prompt.slice(0, MAX_TITLE_LENGTH).trimEnd() + "…"
        : prompt;
      wchatDb.updateChatTitle(workspaceChatId, title);
    }

    // Build initial conversation history from workspace chat messages
    // All agent messages are mapped to 'assistant' role, user messages stay 'user'
    // Include attachment hints on user messages so the agent remembers previous files
    const conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = chatResult.messages
      .map((m: WorkspaceMessageRow) => {
        const hint = m.senderType === "user" ? buildAttachmentHint(m.attachments) : "";
        return {
          role: (m.senderType === "user" ? "user" : "assistant") as "user" | "assistant",
          content: stripThinking(m.content) + hint,
        };
      });

    // Persist the user message (once)
    const firstAgent = agents.get(agentIds[0])!;
    const attachments = payload.attachments as Array<{ name: string; path: string; size: number }> | undefined;
    const promptForAgent = prompt + buildAttachmentHint(attachments);
    wchatDb.addMessage({
      workspaceChatId,
      senderType: "user",
      senderId: null,
      content: prompt,
      modelUsed: firstAgent.model,
      attachments,
    });

    // Add user message to in-memory history
    conversationMessages.push({ role: "user", content: prompt });

    // Shared abort controller for the whole request
    const abortController = new AbortController();

    // Register with tracker once for the whole request
    if (tracker) {
      tracker.register(id, { abort: () => abortController.abort() });
    }

    // Run all agents in parallel — each gets only prior conversation + user message
    const agentRunPromises = agentIds.map(async (agentId) => {
      const agent = agents.get(agentId)!;

      // Build system prompt from AGENTS.md on disk
      let agentsMdContent = "You are a helpful assistant.";
      if (agentFolderBasePath) {
        const agentsMdPath = join(agentFolderBasePath, ".agents", agent.alias, "AGENTS.md");
        try {
          agentsMdContent = readFileSync(agentsMdPath, "utf-8");
        } catch {
          // File doesn't exist — use default
        }
      }
      const systemPrompt = buildSystemPrompt(agentsMdContent);

      // Build ImageContent[] from image attachments so vision models can see them
      const uploadsDir = resolveUploadsDir(agentFolderBasePath, firstAgent.alias, workspaceDir);
      const imageContents = uploadsDir ? buildImageContents(attachments, uploadsDir) : [];
      const images = imageContents.length > 0 ? imageContents : undefined;

      // Each agent gets the same conversation history (no other agents' responses)
      const agentMessages = [...conversationMessages];

      const agentInput: AgentRunInput = {
        modelId: agent.model,
        baseUrl: process.env.OLLAMA_HOST ?? "http://localhost:11434",
        systemPrompt,
        contextWindow: contextLengthFor?.(agent.model),
        messages: agentMessages,
        prompt: promptForAgent,
        images,
        agentFolderBasePath,
        agentAlias: agent.alias,
        toolNames: agent.tools ?? undefined,
        workspacePath: workspaceDir,
        onEvent: (event: any) => {
          // Forward streaming events with agentId attached
          const eventWithAgentId = { ...event, agentId } as StreamEvent;
          send({ type: "stream", id, event: eventWithAgentId });
        },
        signal: abortController.signal,
      };

      // Emit workspace_agent_start before running the agent
      send({ type: "stream", id, event: { type: "workspace_agent_start", agentId, agentName: agent.name } });

      try {
        const result = await chatResponse(agentInput);
        // Emit workspace_agent_end after successful completion
        send({ type: "stream", id, event: { type: "workspace_agent_end", agentId } });
        return { agentId, result };
      } catch (err) {
        // Emit workspace_agent_end even on error
        send({ type: "stream", id, event: { type: "workspace_agent_end", agentId } });
        // Re-throw with agentId attached so Promise.allSettled can identify which agent failed
        const error = new Error(err instanceof Error ? err.message : "generation failed");
        (error as any).agentId = agentId;
        throw error;
      }
    });

    // Wait for all agents to settle — successes are collected, failures captured
    const settled = await Promise.allSettled(agentRunPromises);

    // Unregister from tracker after all agents complete
    tracker?.unregister(id);

    const responses: AgentResponse[] = [];
    const errors: AgentError[] = [];
    let aborted = false;

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        const { agentId, result } = outcome.value;

        // If aborted, mark it
        if (result.aborted) {
          aborted = true;
        }

        // Persist the agent response
        const promptTokens = result.promptTokens ?? undefined;
        const completionTokens = result.completionTokens ?? undefined;
        const totalTokens = (promptTokens !== undefined && completionTokens !== undefined)
          ? promptTokens + completionTokens
          : undefined;

        wchatDb.addMessage({
          workspaceChatId,
          senderType: "agent",
          senderId: agentId,
          content: result.content,
          modelUsed: agents.get(agentId)!.model,
          promptTokens,
          completionTokens,
          totalTokens,
        });

        responses.push({ response: result.content, agentId });
      } else {
        // Agent failed — workspace_agent_end was already emitted in the catch block
        const err = outcome.reason;
        const agentId = (err as any)?.agentId ?? "unknown";
        const message = err instanceof Error ? err.message : "generation failed";
        console.error(`[host] send-workspace-message agent ${agentId} error: ${message}`);
        errors.push({ agentId, message });
      }
    }

    // Build final response
    const responseData: WorkspaceMessageResponse = { responses, workspaceChatId };
    if (errors.length > 0) {
      responseData.errors = errors;
    }
    if (aborted) {
      (responseData as any).aborted = true;
    }
    sendResponse(send, id, responseData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    console.error(`[host] send-workspace-message error: ${message}`);
    sendResponse(send, id, undefined, message);
  }
}

export function handleCreateWorkspaceChat(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wchatDb: WorkspaceChatsDb | undefined,
): void {
  if (!wchatDb) {
    sendResponse(send, id, undefined, "workspace chats database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  try {
    const chat = wchatDb.createChat({
      workspaceId,
      title: payload.title as string | undefined,
    });
    sendResponse(send, id, chat);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to create workspace chat";
    sendResponse(send, id, undefined, message);
  }
}

export function handleListWorkspaceChats(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wchatDb: WorkspaceChatsDb | undefined,
): void {
  if (!wchatDb) {
    sendResponse(send, id, undefined, "workspace chats database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceId = payload.workspaceId as string;

  const chats = wchatDb.listChats(workspaceId);
  sendResponse(send, id, chats);
}

export function handleGetWorkspaceChat(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  wchatDb: WorkspaceChatsDb | undefined,
): void {
  if (!wchatDb) {
    sendResponse(send, id, undefined, "workspace chats database not available");
    return;
  }

  const err = validateRequired(payload, ["workspaceChatId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const workspaceChatId = payload.workspaceChatId as string;

  const result = wchatDb.getChat(workspaceChatId);
  if (!result) {
    sendResponse(send, id, undefined, `workspace chat not found: ${workspaceChatId}`);
    return;
  }

  sendResponse(send, id, result);
}