import { parseIncomingMessage } from "./protocol.js";

export interface MessageHandlers {
  onRegistered: (id: string) => void;
  onPing: () => void;
  onAbort?: (requestId: string) => void;
  onRequest?: (msg: {
    action: string;
    payload: Record<string, unknown>;
    id: string;
    send: (data: unknown) => void;
  }) => void;
  sendResponse?: (data: unknown) => void;
}

export function handleMessage(raw: string, handlers: MessageHandlers): void {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  switch (parsed.type) {
    case "registered":
      handlers.onRegistered(parsed.id as string);
      break;
    case "ping":
      handlers.onPing();
      break;
    case "abort":
      handlers.onAbort?.(parsed.id as string);
      break;
    case "request": {
      const id = parsed.id as string;
      const action = parsed.action as string;
      const payload = (parsed.payload ?? {}) as Record<string, unknown>;

      const send = (data: unknown) => {
        if (handlers.sendResponse) {
          handlers.sendResponse(data);
        }
      };

      handlers.onRequest?.({ action, payload, id, send });
      break;
    }
    default:
      break;
  }
}
