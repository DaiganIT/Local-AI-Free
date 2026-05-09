import type { ModelInfo, ModelProvider } from "./types.js";

/**
 * OmlxProvider discovers models from a local omlx server instance.
 * omlx exposes a /health endpoint (no auth) and an OpenAI-compatible
 * /v1/models endpoint (requires API key).
 *
 * Configurable via env:
 *   OMLX_HOST     — base URL (default: http://localhost:8000)
 *   OMLX_API_KEY  — API key for authenticated endpoints (optional)
 */
export class OmlxProvider implements ModelProvider {
  readonly name = "omlx";
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl ?? process.env.OMLX_HOST ?? "http://localhost:8000";
    this.apiKey = apiKey ?? process.env.OMLX_API_KEY;
  }

  async version(): Promise<{ version: string; reachable: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) {
        return { version: "unknown", reachable: false };
      }
      const data = (await res.json()) as { status?: string; default_model?: string };
      return {
        version: data.status === "healthy" ? "omlx" : "unknown",
        reachable: true,
      };
    } catch {
      return { version: "unknown", reachable: false };
    }
  }

  async models(): Promise<ModelInfo[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(`${this.baseUrl}/v1/models`, { headers });
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
        size: 0,
        provider: "omlx",
      }));
    } catch {
      return [];
    }
  }
}
