import { WebSocket } from "ws";
import { HostInfo, OllamaModel } from "./types.js";

interface HostEntry extends HostInfo {
  socket: WebSocket;
}

interface RegistryOptions {
  generateId: () => string;
  clock: () => string;
}

export interface Registry {
  registerHost(
    socket: WebSocket,
    hostname: string,
    ollamaVersion: string,
    models: OllamaModel[]
  ): string;
  updateHeartbeat(id: string, models: OllamaModel[]): void;
  removeHost(id: string): void;
  listHosts(): HostInfo[];
}

export function createRegistry({ generateId, clock }: RegistryOptions): Registry {
  const hosts = new Map<string, HostEntry>();

  return {
    registerHost(
      socket: WebSocket,
      hostname: string,
      ollamaVersion: string,
      models: OllamaModel[]
    ): string {
      const id = generateId();
      const now = clock();
      hosts.set(id, {
        id,
        socket,
        hostname,
        connectedAt: now,
        lastHeartbeat: now,
        ollamaVersion,
        models,
        status: "online",
      });
      console.log(`[registry] Host registered: ${hostname} (${id})`);
      return id;
    },

    updateHeartbeat(id: string, models: OllamaModel[]): void {
      const host = hosts.get(id);
      if (!host) return;
      host.lastHeartbeat = clock();
      host.models = models;
      host.status = "online";
    },

    removeHost(id: string): void {
      const host = hosts.get(id);
      if (!host) return;
      console.log(`[registry] Host disconnected: ${host.hostname} (${id})`);
      hosts.delete(id);
    },

    listHosts(): HostInfo[] {
      return Array.from(hosts.values()).map(({ socket: _socket, ...info }) => info);
    },
  };
}
