import type { ModelInfo, ModelProvider } from "./types.js";

/**
 * MlxProvider discovers models from a local mlx-omni-server instance.
 * mlx-omni-server exposes an OpenAI-compatible /v1/models endpoint.
 */
export class MlxProvider implements ModelProvider {
  readonly name = "mlx";
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.MLX_HOST ?? "http://localhost:11435";
  }

  async version(): Promise<{ version: string; reachable: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) {
        return { version: "unknown", reachable: false };
      }
      return { version: "mlx-omni-server", reachable: true };
    } catch {
      return { version: "unknown", reachable: false };
    }
  }

  async models(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as {
        object: string;
        data?: { id: string }[];
      };

      if (!Array.isArray(data.data)) {
        return [];
      }

      return data.data.map((m) => ({
        name: m.id,
        size: 0, // mlx-omni-server does not report model size
        provider: "mlx",
      }));
    } catch {
      return [];
    }
  }
}
