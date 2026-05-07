export interface ModelInfo {
  name: string;
  size: number;
  /** Provider that discovered this model (e.g. "ollama", "mlx"). */
  provider: string;
  contextLength?: number;
  capabilities?: string[];
}

export interface HostInfo {
  id: string;
  hostname: string;
  connectedAt: string;
  lastHeartbeat: string;
  providers: { name: string; version: string }[];
  models: ModelInfo[];
  status: "online" | "offline";
}

// Messages sent from llm-host → server
export type HostMessage =
  | {
      type: "register";
      hostname: string;
      providers: { name: string; version: string }[];
      models: ModelInfo[];
    }
  | {
      type: "heartbeat";
      models: ModelInfo[];
    };

// Messages sent from server → llm-host
export type ServerMessage =
  | { type: "registered"; id: string }
  | { type: "ping" };
