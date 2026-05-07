import { buildHeartbeatMessage, type ModelInfo } from "./protocol.js";

export interface HeartbeatOptions {
  intervalMs: number;
  fetchModels: () => Promise<ModelInfo[]>;
  send: (data: string) => void;
}

export function createHeartbeat(options: HeartbeatOptions): () => void {
  const interval = setInterval(async () => {
    const models = await options.fetchModels();
    options.send(buildHeartbeatMessage(models));
  }, options.intervalMs);

  return () => clearInterval(interval);
}
