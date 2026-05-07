import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaProvider } from "../src/providers/ollama-discovery.js";
import type { ModelInfo } from "../src/providers/types.js";

const MOCK_OLLAMA_HOST = "http://mock-ollama:11434";

afterEach(() => {
  delete process.env.OLLAMA_CONTEXT_LENGTH;
});

describe("OllamaProvider", () => {
  it("has name 'ollama'", () => {
    const provider = new OllamaProvider();
    expect(provider.name).toBe("ollama");
  });

  describe("version()", () => {
    it("returns version and reachable=true on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ version: "0.3.5" }),
      });

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "0.3.5", reachable: true });
      expect(global.fetch).toHaveBeenCalledWith(`${MOCK_OLLAMA_HOST}/api/version`);
    });

    it('returns version="unknown" and reachable=false on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const result = await provider.version();

      expect(result).toEqual({ version: "unknown", reachable: false });
    });
  });

  describe("models()", () => {
    it("calls /api/show per model and extracts contextLength from model_info", async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            models: [
              { name: "llama3.2", size: 2019392832 },
              { name: "phi3", size: 1929381837 },
            ],
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            model_info: { "llama.context_length": 4096 },
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            model_info: { "phi3.context_length": 32768 },
          }),
        });

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const models = await provider.models();

      expect(models).toEqual([
        { name: "llama3.2", size: 2019392832, provider: "ollama", contextLength: 4096 },
        { name: "phi3", size: 1929381837, provider: "ollama", contextLength: 32768 },
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("returns empty array on network error for /api/tags", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const models = await provider.models();

      expect(models).toEqual([]);
    });

    it("extracts capabilities from /api/show", async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            models: [{ name: "qwen3-vl:2b", size: 1889519687 }],
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            model_info: { "qwen3vl.context_length": 32768 },
            capabilities: ["completion", "vision", "tools", "thinking"],
          }),
        });

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const models = await provider.models();

      expect(models).toEqual([
        { name: "qwen3-vl:2b", size: 1889519687, provider: "ollama", contextLength: 32768, capabilities: ["completion", "vision", "tools", "thinking"] },
      ]);
    });

    it("omits contextLength when /api/show fails for a model", async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            models: [
              { name: "good-model", size: 1000000000 },
              { name: "bad-model", size: 2000000000 },
            ],
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            model_info: { "test.context_length": 8192 },
          }),
        })
        .mockRejectedValueOnce(new Error("show failed"));

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const models = await provider.models();

      expect(models).toContainEqual({ name: "good-model", size: 1000000000, provider: "ollama", contextLength: 8192 });
      expect(models).toContainEqual({ name: "bad-model", size: 2000000000, provider: "ollama" });
    });

    it("applies OLLAMA_CONTEXT_LENGTH cap when set", async () => {
      process.env.OLLAMA_CONTEXT_LENGTH = "16384";
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            models: [{ name: "llama3", size: 2019392832 }],
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            model_info: { "llama.context_length": 32768 },
          }),
        });

      const provider = new OllamaProvider(MOCK_OLLAMA_HOST);
      const models = await provider.models();
      expect(models).toEqual([{ name: "llama3", size: 2019392832, provider: "ollama", contextLength: 16384 }]);
    });
  });
});
