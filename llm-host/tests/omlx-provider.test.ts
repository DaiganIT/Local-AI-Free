import { describe, it, expect, vi, afterEach } from "vitest";
import * as piAi from "@mariozechner/pi-ai";
import { buildOmlxMessages, streamSimpleOmlx } from "../src/providers/omlx.js";

function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("buildOmlxMessages", () => {
  it("serializes user text+image into OpenAI content array", () => {
    const ctx: piAi.Context = {
      systemPrompt: "You are helpful.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOmlxMessages(ctx);

    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toEqual([
      { type: "text", text: "What is in this image?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    ]);
  });

  it("keeps text-only user messages as strings", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: "Just text",
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOmlxMessages(ctx);

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: "user", content: "Just text" });
  });

  it("serializes multiple images in order", () => {
    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Compare these." },
            { type: "image", data: "img1", mimeType: "image/png" },
            { type: "image", data: "img2", mimeType: "image/jpeg" },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const msgs = buildOmlxMessages(ctx);

    expect(msgs[0].content).toEqual([
      { type: "text", text: "Compare these." },
      { type: "image_url", image_url: { url: "data:image/png;base64,img1" } },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,img2" } },
    ]);
  });
});

describe("streamSimpleOmlx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes image_url blocks in the request payload", async () => {
    const body = {
      ok: true,
      status: 200,
      body: makeReadableStream([
        "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n",
        "data: {\"choices\":[{\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}\n",
      ]),
    };

    global.fetch = vi.fn().mockResolvedValue(body as any);

    const model: piAi.Model<string> = {
      id: "omlx-model",
      name: "omlx-model",
      api: "omlx",
      provider: "omlx",
      baseUrl: "http://mock-omlx:8000",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 0,
      maxTokens: 32000,
    };

    const ctx: piAi.Context = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look" },
            { type: "image", data: "img", mimeType: "image/png" },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const stream = streamSimpleOmlx(model, ctx);
    await stream.result();

    const [, options] = (global.fetch as any).mock.calls[0];
    const payload = JSON.parse(options.body as string);

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "Look" },
      { type: "image_url", image_url: { url: "data:image/png;base64,img" } },
    ]);
  });
});
