import type { AgentsDb } from "../agents-db.js";
import type { ChatDb } from "../chat-db.js";
import { validateRequired } from "../utils.js";
import { sendResponse } from "../send-response.js";

export function handleCreateChat(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  db: AgentsDb,
  chatDb: ChatDb | undefined,
): void {
  if (!chatDb) {
    sendResponse(send, id, undefined, "chat database not available");
    return;
  }

  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }

  const agentId = payload.agentId as string;
  const title = payload.title as string | undefined;

  try {
    const chat = chatDb.createChat({ agentId, title });
    sendResponse(send, id, chat);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to create chat";
    sendResponse(send, id, undefined, message);
  }
}

export function handleListChats(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  chatDb: ChatDb | undefined,
): void {
  if (!chatDb) {
    sendResponse(send, id, undefined, "chat database not available");
    return;
  }

  const err = validateRequired(payload, ["agentId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const agentId = payload.agentId as string;

  const chats = chatDb.listChats(agentId);
  sendResponse(send, id, chats);
}

export function handleGetChat(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  chatDb: ChatDb | undefined,
  db: AgentsDb,
  contextLengthFor: ((model: string) => number | undefined) | undefined,
): void {
  if (!chatDb) {
    sendResponse(send, id, undefined, "chat database not available");
    return;
  }

  const err = validateRequired(payload, ["chatId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const chatId = payload.chatId as string;

  const result = chatDb.getChat(chatId);
  if (!result) {
    sendResponse(send, id, undefined, `chat not found: ${chatId}`);
    return;
  }

  // Compute context information
  const contextLength = contextLengthFor
    ? db.getAgent(result.chat.agentId)
      ? contextLengthFor(db.getAgent(result.chat.agentId)!.model)
      : undefined
    : undefined;

  // contextUsed = last assistant message's total tokens (prompt + completion)
  let contextUsed: number | undefined;
  let totalIn: number | undefined;
  let totalOut: number | undefined;
  let totalReasoning: number | undefined;
  const lastAssistant = [...result.messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant?.totalTokens != null) {
    contextUsed = lastAssistant.totalTokens;
    totalIn = lastAssistant.promptTokens ?? 0;
    totalOut = lastAssistant.completionTokens ?? 0;
  }
  if (lastAssistant?.reasoningTokens != null) {
    totalReasoning = lastAssistant.reasoningTokens;
  }

  sendResponse(send, id, {
    chat: result.chat,
    messages: result.messages,
    totalIn: totalIn,
    totalOut: totalOut,
    totalReasoning,
    contextUsed,
    contextLength,
  });
}

export function handleDeleteChat(
  payload: Record<string, unknown>,
  id: string,
  send: (data: unknown) => void,
  chatDb: ChatDb | undefined,
): void {
  if (!chatDb) {
    sendResponse(send, id, undefined, "chat database not available");
    return;
  }

  const err = validateRequired(payload, ["chatId"]);
  if (err) { sendResponse(send, id, undefined, err); return; }
  const chatId = payload.chatId as string;

  try {
    chatDb.deleteChat(chatId);
    sendResponse(send, id, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to delete chat";
    sendResponse(send, id, undefined, message);
  }
}
