import { describe, it, expect, vi, afterEach } from "vitest";
import { getOllamaVersion, getOllamaModels } from "../src/ollama.js";

const MOCK_OLLAMA_HOST = "http://mock-ollama:11434";

afterEach(() => {
  delete process.env.OLLAMA_CONTEXT_LENGTH;
});

describe("getOllamaVersion", () => {
  it("returns version and reachable=true on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ version: "0.3.5" }),
    });

    const result = await getOllamaVersion(MOCK_OLLAMA_HOST);

    expect(result).toEqual({ version: "0.3.5", reachable: true });
    expect(global.fetch).toHaveBeenCalledWith(`${MOCK_OLLAMA_HOST}/api/version`);
  });

  it('returns version="unknown" and reachable=false on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await getOllamaVersion(MOCK_OLLAMA_HOST);

    expect(result).toEqual({ version: "unknown", reachable: false });
  });
});

describe("getOllamaModels", () => {
  it("calls /api/show per model and extracts context_length from model_info", async () => {
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

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toEqual([
      { name: "llama3.2", size: 2019392832, contextLength: 4096 },
      { name: "phi3", size: 1929381837, contextLength: 32768 },
    ]);
    // Verify it called: 1 for /api/tags + 2 for /api/show
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[1][0]).toBe(`${MOCK_OLLAMA_HOST}/api/show`);
    expect(calls[2][0]).toBe(`${MOCK_OLLAMA_HOST}/api/show`);
  });

  it("returns models without contextLength when /api/show has no context_length key", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          models: [{ name: "some-model", size: 1000000000 }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          model_info: { "some.other_field": 123 },
        }),
      });

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toEqual([{ name: "some-model", size: 1000000000 }]);
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

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toContainEqual({ name: "good-model", size: 1000000000, contextLength: 8192 });
    expect(models).toContainEqual({ name: "bad-model", size: 2000000000 });
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

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);
    expect(models).toEqual([{ name: "llama3", size: 2019392832, contextLength: 16384 }]);
  });

  it("uses model context when OLLAMA_CONTEXT_LENGTH is larger", async () => {
    process.env.OLLAMA_CONTEXT_LENGTH = "65536";
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          models: [{ name: "tiny-model", size: 500000000 }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          model_info: { "tiny.context_length": 8192 },
        }),
      });

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);
    expect(models).toEqual([{ name: "tiny-model", size: 500000000, contextLength: 8192 }]);
  });

  it("returns models without cap when OLLAMA_CONTEXT_LENGTH is not set", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          models: [{ name: "big-model", size: 4000000000 }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          model_info: { "big.context_length": 131072 },
        }),
      });

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);
    expect(models).toEqual([{ name: "big-model", size: 4000000000, contextLength: 131072 }]);
  });

  it("returns empty array on network error for /api/tags", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

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

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toEqual([
      { name: "qwen3-vl:2b", size: 1889519687, contextLength: 32768, capabilities: ["completion", "vision", "tools", "thinking"] },
    ]);
  });

  it("omits capabilities when /api/show has no capabilities field", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          models: [{ name: "legacy-model", size: 1000000000 }],
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          model_info: { "legacy.context_length": 4096 },
        }),
      });

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toEqual([
      { name: "legacy-model", size: 1000000000, contextLength: 4096 },
    ]);
  });

  it("omits capabilities when /api/show fails for a model", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          models: [{ name: "failing-model", size: 500000000 }],
        }),
      })
      .mockRejectedValueOnce(new Error("show failed"));

    const models = await getOllamaModels(MOCK_OLLAMA_HOST);

    expect(models).toEqual([{ name: "failing-model", size: 500000000 }]);
  });
});
