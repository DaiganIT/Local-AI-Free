import { describe, it, expect, vi } from "vitest";
import { MlxProvider } from "../src/providers/mlx-discovery.js";

const MOCK_MLX_HOST = "http://mock-mlx:11435";

describe("MlxProvider", () => {
  it("has name 'mlx'", () => {
    const provider = new MlxProvider();
    expect(provider.name).toBe("mlx");
  });

  describe("version()", () => {
    it("returns reachable=true when /v1/models responds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          object: "list",
          data: [],
        }),
      });

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "mlx-omni-server", reachable: true });
    });

    it("returns reachable=false on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });

    it("returns reachable=false on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });
  });

  describe("models()", () => {
    it("maps /v1/models data to ModelInfo array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          object: "list",
          data: [
            { id: "mlx-community/Llama-3.2-3B-Instruct-4bit" },
            { id: "mlx-community/Qwen2.5-7B-Instruct-4bit" },
          ],
        }),
      });

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([
        { name: "mlx-community/Llama-3.2-3B-Instruct-4bit", size: 0, provider: "mlx" },
        { name: "mlx-community/Qwen2.5-7B-Instruct-4bit", size: 0, provider: "mlx" },
      ]);
    });

    it("returns empty array on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array when data is not an array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ object: "list" }),
      });

      const provider = new MlxProvider(MOCK_MLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });
  });
});
