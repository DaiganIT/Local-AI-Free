import type { AgentsDb } from "../agents-db.js";
import type { ChatDb } from "../chat-db.js";
import type { AgentRunInput, AgentRunResult } from "../agent-runner.js";
import type { StreamEvent } from "../protocol.js";
import type { RequestTracker } from "../request-tracker.js";
import type { ProviderLookup } from "../providers/provider-registry.js";
import { validateRequired } from "../utils.js";
import { sendResponse } from "../send-response.js";
import { writeLastRunLog, writeLastErrorLog } from "./agent-logs.js";
import { runAgentChat } from "../run-agent-chat.js";

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
  const chatId = payload.chatId as string | undefined;
  const attachments = payload.attachments as Array<{ name: string; path: string; size: number }> | undefined;

  const agent = db.getAgent(agentId!);
  if (!agent) {
    sendResponse(send, id, undefined, `agent not found: ${agentId}`);
    return;
  }

  try {
    const { result, chatId: finalChatId, userMessageId } = await runAgentChat({
      agent,
      prompt,
      chatId,
      attachments,
      chatDb,
      chatResponse,
      contextLengthFor,
      findProviderForModel,
      agentFolderBasePath,
      requestId: id,
      tracker,
      onEvent: (event: unknown) => {
        send({ type: "stream", id, event: event as StreamEvent });
      },
    });

    sendResponse(send, id, {
      response: result.content,
      agentId,
      chatId: finalChatId,
      userMessageId,
      aborted: result.aborted ?? false,
    });

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
