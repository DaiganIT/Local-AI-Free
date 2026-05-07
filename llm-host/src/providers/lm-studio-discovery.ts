import type { ModelInfo, ModelProvider } from "./types.js";

/**
 * LmStudioProvider discovers models from a local LM Studio instance.
 * LM Studio exposes an OpenAI-compatible /v1/models endpoint.
 * No authentication required by default.
 *
 * Configurable via env:
 *   LM_STUDIO_HOST — base URL (default: http://localhost:1234)
 */
export class LmStudioProvider implements ModelProvider {
  readonly name = "lm-studio";
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ?? process.env.LM_STUDIO_HOST ?? "http://localhost:1234/api";
  }

  async version(): Promise<{ version: string; reachable: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) {
        return { version: "unknown", reachable: false };
      }
      return { version: "lm-studio", reachable: true };
    } catch (err) {
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
        size: 0, // LM Studio does not report model size via /v1/models
        provider: "lm-studio",
      }));
    } catch {
      return [];
    }
  }
}
