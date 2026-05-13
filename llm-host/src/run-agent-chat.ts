import { readFileSync } from "fs";
import { join } from "path";
import type { AgentRow } from "./agents-db.js";
import type { ChatDb } from "./chat-db.js";
import type { AgentRunInput, AgentRunResult } from "./agent-runner.js";
import type { Attachment } from "./types.js";
import type { RequestTracker } from "./request-tracker.js";
import type { ProviderLookup } from "./providers/provider-registry.js";
import {
  stripThinking,
  buildSystemPrompt,
  buildAttachmentHint,
  buildImageContents,
  resolveUploadsDir,
} from "./handlers/agent-prompt.js";

export interface RunAgentChatInput {
  agent: AgentRow;
  prompt: string;
  chatId?: string;
  attachments?: Attachment[];
  chatDb?: ChatDb;
  chatResponse: (input: AgentRunInput) => Promise<AgentRunResult>;
  contextLengthFor?: (model: string) => number | undefined;
  findProviderForModel?: (modelName: string) => ProviderLookup | undefined;
  agentFolderBasePath?: string;
  requestId?: string;
  tracker?: RequestTracker;
  onEvent?: (event: unknown) => void;
}

export interface RunAgentChatOutput {
  result: AgentRunResult;
  chatId: string | null;
  userMessageId: string | null;
}

export async function runAgentChat(input: RunAgentChatInput): Promise<RunAgentChatOutput> {
  const {
    agent,
    prompt,
    chatDb,
    chatResponse,
    contextLengthFor,
    findProviderForModel,
    agentFolderBasePath,
    requestId,
    tracker,
    onEvent,
  } = input;

  let chatId = input.chatId;

  if (!chatId && chatDb) {
    const chat = chatDb.createChat({ agentId: agent.id });
    chatId = chat.id;
  }

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
  let conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let userMessageId: string | undefined;

  if (chatDb && chatId) {
    const chatResult = chatDb.getChat(chatId);
    if (chatResult && chatResult.messages.length === 0) {
      const MAX_TITLE_LENGTH = 50;
      const title = prompt.length > MAX_TITLE_LENGTH
        ? prompt.slice(0, MAX_TITLE_LENGTH).trimEnd() + "…"
        : prompt;
      chatDb.updateChatTitle(chatId, title);
    } else if (chatResult) {
      conversationMessages = chatResult.messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          const hint = m.role === "user" ? buildAttachmentHint(m.attachments) : "";
          return {
            role: m.role as "user" | "assistant",
            content: stripThinking(m.content) + hint,
          };
        });
    }

    userMessageId = chatDb.insertMessage({
      chatId,
      role: "user",
      content: prompt,
      modelUsed: agent.model,
      attachments: input.attachments,
    }).id;
  }

  const promptForAgent = prompt + buildAttachmentHint(input.attachments);
  const uploadsDir = resolveUploadsDir(agentFolderBasePath, agent.alias, undefined);
  const imageContents = uploadsDir ? buildImageContents(input.attachments, uploadsDir) : [];
  const images = imageContents.length > 0 ? imageContents : undefined;

  const providerLookup = findProviderForModel?.(agent.model);
  const effectiveProvider = providerLookup?.provider ?? "ollama";
  const effectiveBaseUrl = providerLookup?.baseUrl ?? (process.env.OLLAMA_HOST ?? "http://localhost:11434");

  if (!providerLookup) {
    console.warn(`[run-agent-chat] No provider found for model "${agent.model}", defaulting to ollama`);
  }

  const abortController = new AbortController();
  const agentInput: AgentRunInput = {
    modelId: agent.model,
    baseUrl: effectiveBaseUrl,
    provider: effectiveProvider,
    systemPrompt,
    contextWindow: contextLengthFor?.(agent.model),
    messages: conversationMessages,
    prompt: promptForAgent,
    images,
    agentFolderBasePath,
    agentAlias: agent.alias,
    toolNames: agent.tools ?? undefined,
    onEvent,
    signal: abortController.signal,
  };

  if (tracker && requestId) {
    tracker.register(requestId, { abort: () => abortController.abort() });
  }

  let result: AgentRunResult;
  try {
    result = await chatResponse(agentInput);
  } finally {
    if (tracker && requestId) {
      tracker.unregister(requestId);
    }
  }

  if (chatDb && chatId && userMessageId) {
    const promptTokens = result.promptTokens ?? null;
    const completionTokens = result.completionTokens ?? null;
    const totalTokens = (promptTokens !== null && completionTokens !== null)
      ? promptTokens + completionTokens
      : null;
    const reasoningTokens = result.reasoningTokens ?? undefined;
    const thinkingContent = result.thinkingContent || undefined;

    chatDb.insertMessage({
      chatId,
      role: "assistant",
      content: result.content,
      modelUsed: agent.model,
      promptTokens: promptTokens ?? undefined,
      completionTokens: completionTokens ?? undefined,
      totalTokens: totalTokens ?? undefined,
      reasoningTokens,
      thinkingContent,
    });
  }

  return {
    result,
    chatId: chatId ?? null,
    userMessageId: userMessageId ?? null,
  };
}
