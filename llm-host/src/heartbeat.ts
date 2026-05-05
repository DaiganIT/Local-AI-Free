import { buildHeartbeatMessage, type OllamaModel } from "./protocol.js";

export interface HeartbeatOptions {
  intervalMs: number;
  fetchModels: () => Promise<OllamaModel[]>;
  send: (data: string) => void;
}

export function createHeartbeat(options: HeartbeatOptions): () => void {
  const interval = setInterval(async () => {
    const models = await options.fetchModels();
    options.send(buildHeartbeatMessage(models));
  }, options.intervalMs);

  return () => clearInterval(interval);
}
