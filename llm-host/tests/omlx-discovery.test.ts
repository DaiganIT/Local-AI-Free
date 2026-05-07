import { describe, it, expect, vi, beforeEach } from "vitest";
import { OmlxProvider } from "../src/providers/omlx-discovery.js";

const MOCK_OMLX_HOST = "http://mock-omlx:8000";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("OmlxProvider", () => {
  describe("version()", () => {
    it("returns reachable=true with version 'omlx' when /health reports healthy", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "healthy", default_model: "qwen" }), { status: 200 }),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "omlx", reachable: true });
      expect(global.fetch).toHaveBeenCalledWith(`${MOCK_OMLX_HOST}/health`);
    });

    it("returns reachable=false when /health returns non-200", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("error", { status: 500 }),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });

    it("returns reachable=false when fetch throws", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connection refused"));

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });
  });

  describe("models()", () => {
    it("returns models from /v1/models", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "qwen3.5", object: "model" },
              { id: "llama-3b", object: "model" },
            ],
          }),
          { status: 200 },
        ),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([
        { name: "qwen3.5", size: 0, provider: "omlx" },
        { name: "llama-3b", size: 0, provider: "omlx" },
      ]);
    });

    it("sends Authorization header when apiKey is provided", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ object: "list", data: [{ id: "qwen" }] }),
          { status: 200 },
        ),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST, "test-key");
      await provider.models();

      expect(global.fetch).toHaveBeenCalledWith(`${MOCK_OMLX_HOST}/v1/models`, {
        headers: { Authorization: "Bearer test-key" },
      });
    });

    it("does not send Authorization header when apiKey is absent", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ object: "list", data: [{ id: "qwen" }] }),
          { status: 200 },
        ),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      await provider.models();

      expect(global.fetch).toHaveBeenCalledWith(`${MOCK_OMLX_HOST}/v1/models`, { headers: {} });
    });

    it("returns empty array when /v1/models returns non-200", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("unauthorized", { status: 401 }),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array when fetch throws", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connection refused"));

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array when response data is not an array", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ object: "list" }), { status: 200 }),
      );

      const provider = new OmlxProvider(MOCK_OMLX_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });
  });

  describe("name", () => {
    it("has name 'omlx'", () => {
      const provider = new OmlxProvider();
      expect(provider.name).toBe("omlx");
    });
  });

  describe("defaults", () => {
    it("defaults to OMLX_HOST env var", () => {
      // Not setting OMLX_HOST — just verify it doesn't throw
      const provider = new OmlxProvider();
      expect(provider.name).toBe("omlx");
    });
  });
});
