import { describe, it, expect, vi, beforeEach } from "vitest";
import { LmStudioProvider } from "../src/providers/lm-studio-discovery.js";

const MOCK_HOST = "http://mock-lm-studio:1234";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("LmStudioProvider", () => {
  describe("version()", () => {
    it("returns reachable=true with version 'lm-studio' when /v1/models is reachable", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ object: "list", data: [{ id: "llama-3.2-1b" }] }),
          { status: 200 },
        ),
      );

      const provider = new LmStudioProvider(MOCK_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "lm-studio", reachable: true });
      expect(global.fetch).toHaveBeenCalledWith(`${MOCK_HOST}/v1/models`);
    });

    it("returns reachable=false when /v1/models returns non-200", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("error", { status: 500 }),
      );

      const provider = new LmStudioProvider(MOCK_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });

    it("returns reachable=false when fetch throws", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connection refused"));

      const provider = new LmStudioProvider(MOCK_HOST);
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
              { id: "llama-3.2-1b", object: "model" },
              { id: "mistral-7b", object: "model" },
            ],
          }),
          { status: 200 },
        ),
      );

      const provider = new LmStudioProvider(MOCK_HOST);
      const models = await provider.models();

      expect(models).toEqual([
        { name: "llama-3.2-1b", size: 0, provider: "lm-studio" },
        { name: "mistral-7b", size: 0, provider: "lm-studio" },
      ]);
    });

    it("returns empty array when /v1/models returns non-200", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("error", { status: 500 }),
      );

      const provider = new LmStudioProvider(MOCK_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array when fetch throws", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("connection refused"));

      const provider = new LmStudioProvider(MOCK_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("returns empty array when response data is not an array", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ object: "list" }), { status: 200 }),
      );

      const provider = new LmStudioProvider(MOCK_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });
  });

  describe("name", () => {
    it("has name 'lm-studio'", () => {
      const provider = new LmStudioProvider();
      expect(provider.name).toBe("lm-studio");
    });
  });

  describe("defaults", () => {
    it("defaults to LM_STUDIO_HOST env var", () => {
      const provider = new LmStudioProvider();
      expect(provider.name).toBe("lm-studio");
    });
  });
});
