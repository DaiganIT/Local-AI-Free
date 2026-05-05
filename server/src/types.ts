export interface OllamaModel {
  name: string;
  size: number;
  contextLength?: number;
  capabilities?: string[];
}

export interface HostInfo {
  id: string;
  hostname: string;
  connectedAt: string;
  lastHeartbeat: string;
  ollamaVersion: string;
  models: OllamaModel[];
  status: "online" | "offline";
}

// Messages sent from llm-host → server
export type HostMessage =
  | {
      type: "register";
      hostname: string;
      ollamaVersion: string;
      models: OllamaModel[];
    }
  | {
      type: "heartbeat";
      models: OllamaModel[];
    };

// Messages sent from server → llm-host
export type ServerMessage =
  | { type: "registered"; id: string }
  | { type: "ping" };
