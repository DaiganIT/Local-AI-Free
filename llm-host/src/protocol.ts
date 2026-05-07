export interface ModelInfo {
  name: string;
  size: number;
  provider: string;
  contextLength?: number;
  capabilities?: string[];
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RegisterMessage {
  type: "register";
  hostname: string;
  providers: { name: string; version: string }[];
  models: ModelInfo[];
  apiKey: string;
}

export interface HeartbeatMessage {
  type: "heartbeat";
  models: ModelInfo[];
}

export interface RegisteredMessage {
  type: "registered";
  id: string;
}

export interface PingMessage {
  type: "ping";
}

export interface ServerRequest {
  type: "request";
  id: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface ServerResponse {
  type: "response";
  id: string;
  data?: unknown;
  error?: string;
}

/** An agent event forwarded during streaming (mirrors pi-agent-core AgentEvent). */
export type StreamEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
  | { type: "message_start"; message: unknown; agentId?: string }
  | { type: "message_update"; message?: unknown; assistantMessageEvent: { type: string; delta?: string; contentIndex?: number; [key: string]: unknown }; agentId?: string }
  | { type: "message_end"; message: unknown; agentId?: string }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "workspace_agent_start"; agentId: string; agentName: string }
  | { type: "workspace_agent_end"; agentId: string };

export interface StreamMessage {
  type: "stream";
  id: string;
  event: StreamEvent;
}

export type OutgoingMessage = RegisterMessage | HeartbeatMessage | ServerResponse | StreamMessage;
export type IncomingMessage = RegisteredMessage | PingMessage | ServerRequest;

export function buildRegisterMessage(hostname: string, providers: { name: string; version: string }[], models: ModelInfo[], apiKey: string): string {
  const msg: RegisterMessage = { type: "register", hostname, providers, models, apiKey };
  return JSON.stringify(msg);
}

export function buildResponse(id: string, data?: unknown, error?: string): string {
  const msg: ServerResponse = { type: "response", id };
  if (error !== undefined) {
    msg.error = error;
  } else {
    msg.data = data;
  }
  return JSON.stringify(msg);
}

export function buildStreamMessage(id: string, event: StreamEvent): string {
  const msg: StreamMessage = { type: "stream", id, event };
  return JSON.stringify(msg);
}

export function buildHeartbeatMessage(models: ModelInfo[]): string {
  const msg: HeartbeatMessage = { type: "heartbeat", models };
  return JSON.stringify(msg);
}

export function parseIncomingMessage(raw: string): IncomingMessage {
  return JSON.parse(raw) as IncomingMessage;
}
