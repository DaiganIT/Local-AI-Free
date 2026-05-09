import type { AgentsDb } from "../agents-db.js";
import type { ChatDb } from "../chat-db.js";
import type { AgentRunInput, AgentRunResult } from "../agent-runner.js";
import type { StreamEvent } from "../protocol.js";
import type { RequestTracker } from "../request-tracker.js";
import type { ProviderLookup } from "../providers/provider-registry.js";
import { validateRequired } from "../utils.js";
import { sendResponse } from "../send-response.js";
import { stripThinking, buildSystemPrompt, buildAttachmentHint, buildImageContents, resolveUploadsDir } from "./agent-prompt.js";
import { writeLastRunLog, writeLastErrorLog } from "./agent-logs.js";
import { readFileSync } from "fs";
import { join } from "path";

export async function handleSendMessage(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  chatDb: ChatDb | undefined,
  chatResponse: (input: AgentRunInput) => Promise<AgentRunResult>,
  contextLengthFor: ((model: string) => number | undefined) | undefined,
  findProviderForModel: ((modelName: string) => ProviderLookup | undefined) | undefined,
  agentFolderBasePath?: string,
  tracker?: RequestTracker,
): Promise<void> {
  const err = validateRequired(payload, ["prompt"]);
  if (err) { sendResponse(send, id, undefined, err); return; }

  const agentId = payload.agentId as string | undefined;
  const prompt = payload.prompt as string;
  let chatId = payload.chatId as string | undefined;

  const agent = db.getAgent(agentId!);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  // Auto-create a chat if no chatId provided and chatDb is available
  if (!chatId && chatDb) {
    const chat = chatDb.createChat({ agentId: agentId! });
    chatId = chat.id;
  }

  try {
    // Build system prompt from AGENTS.md on disk
    let agentsMdContent = "You are a helpful assistant."; // fallback
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

    // Extract attachments from payload (used for both DB persistence and prompt augmentation)
    const attachments = payload.attachments as Array<{ name: string; path: string; size: number }> | undefined;

    let userMessageId: string | undefined;
    if (chatDb && chatId) {
      // Derive chat title from the first user message (truncated)
      const chatResult = chatDb.getChat(chatId);
      if (chatResult && chatResult.messages.length === 0) {
        const MAX_TITLE_LENGTH = 50;
        const title = prompt.length > MAX_TITLE_LENGTH
          ? prompt.slice(0, MAX_TITLE_LENGTH).trimEnd() + "…"
          : prompt;
        chatDb.updateChatTitle(chatId, title);
      } else if (chatResult) {
        // Build conversation history from existing messages (excluding system)
        // Include attachment hints on user messages so the agent remembers previous files
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

      // Persist the user message
      userMessageId = chatDb.insertMessage({
        chatId,
        role: "user",
        content: prompt,
        modelUsed: agent.model,
        attachments,
      }).id;
    }

    // Build the agent run input (append attachment hints to prompt for the agent)
    const promptForAgent = prompt + buildAttachmentHint(attachments);

    // Build ImageContent[] from image attachments so vision models can see them
    // PDFs and other documents are NOT included — they must be read via read_attachment tool
    const uploadsDir = resolveUploadsDir(agentFolderBasePath, agent.alias, undefined);
    const imageContents = uploadsDir ? buildImageContents(attachments, uploadsDir) : [];
    const images = imageContents.length > 0 ? imageContents : undefined;

    const providerLookup = findProviderForModel?.(agent.model);
    const effectiveProvider = providerLookup?.provider ?? "ollama";
    const effectiveBaseUrl = providerLookup?.baseUrl ?? (process.env.OLLAMA_HOST ?? "http://localhost:11434");

    if (!providerLookup) {
      console.warn(`[send-message] No provider found for model "${agent.model}", defaulting to ollama`);
    }

    const abortController = new AbortController();
    const agentInput: AgentRunInput = {
      modelId: agent.model,
      baseUrl: effectiveBaseUrl,
      provider: effectiveProvider,
      systemPrompt,
      contextWindow: contextLengthFor?.(agent.model),
      messages: conversationMessages as Array<{ role: "user" | "assistant"; content: string }>,
      prompt: promptForAgent,
      images,
      agentFolderBasePath,
      agentAlias: agent.alias,
      toolNames: agent.tools ?? undefined,
      onEvent: (event: any) => {
        send({ type: "stream", id, event: event as StreamEvent });
      },
      signal: abortController.signal,
    };

    // Register with tracker so this request can be aborted
    if (tracker) {
      tracker.register(id, { abort: () => abortController.abort() });
    }

    let result: AgentRunResult;
    try {
      result = await chatResponse(agentInput);
    } finally {
      // Always unregister from tracker after chatResponse completes or throws
      tracker?.unregister(id);
    }

    if (chatDb && chatId && userMessageId) {
      const promptTokens = result.promptTokens ?? null;
      const completionTokens = result.completionTokens ?? null;
      // Only set totalTokens if both values are present
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

    sendResponse(send, id, {
      response: result.content,
      agentId,
      chatId: chatId ?? null,
      userMessageId: userMessageId ?? null,
      aborted: result.aborted ?? false,
    });

    // Write last run log to agent folder
    if (agentFolderBasePath) {
      writeLastRunLog(agentFolderBasePath, agent.alias, {
        agentName: agent.name,
        model: agent.model,
        prompt,
        response: result.content,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    console.error(`[host] send-message error: ${message}`);

    // Write error log to agent folder
    if (agentFolderBasePath) {
      writeLastErrorLog(agentFolderBasePath, agent.alias, {
        agentName: agent.name,
        model: agent.model,
        prompt,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }

    sendResponse(send, id, undefined, message);
  }
}