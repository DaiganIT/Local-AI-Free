import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripThinking, buildSystemPrompt, buildAttachmentHint, buildImageContents, resolveUploadsDir } from "../src/handlers/agent-prompt.js";
import { readConfinedFileBase64 } from "../src/handlers/file-confinement.js";

vi.mock("../src/handlers/file-confinement.js", () => ({
  readConfinedFileBase64: vi.fn(),
}));

describe("buildSystemPrompt", () => {
  it("includes the AGENTS.md content", () => {
    const result = buildSystemPrompt("You are a pirate.");
    expect(result).toContain("You are a pirate.");
  });

  it("includes the write_agents_md tool instructions", () => {
    const result = buildSystemPrompt("You are a helper.");
    expect(result).toContain("write_agents_md");
    expect(result).toContain("overwrites your AGENTS.md file");
  });

  it("includes the section headers", () => {
    const result = buildSystemPrompt("Test content");
    expect(result).toContain("## Your Instructions");
    expect(result).toContain("## Tools");
  });

  it("includes the read_attachment tool instructions", () => {
    const result = buildSystemPrompt("Test content");
    expect(result).toContain("read_attachment");
    expect(result).toContain("[Attached:");
  });
});


describe("buildAttachmentHint", () => {
  it("returns empty string when attachments is undefined", () => {
    expect(buildAttachmentHint(undefined)).toBe("");
  });

  it("returns empty string when attachments is empty", () => {
    expect(buildAttachmentHint([])).toBe("");
  });

  it("returns hint for a single attachment, stripping uploads/ prefix", () => {
    const attachments = [{ name: "report.pdf", path: "uploads/report.pdf", size: 1024 }];
    expect(buildAttachmentHint(attachments)).toBe(
      "\n\n[Attached: report.pdf (report.pdf)]"
    );
  });

  it("returns hints for multiple attachments, one per line", () => {
    const attachments = [
      { name: "report.pdf", path: "uploads/report.pdf", size: 1024 },
      { name: "data.csv", path: "uploads/data.csv", size: 2048 },
    ];
    expect(buildAttachmentHint(attachments)).toBe(
      "\n\n[Attached: report.pdf (report.pdf)]\n[Attached: data.csv (data.csv)]"
    );
  });

  it("handles paths without uploads/ prefix", () => {
    const attachments = [{ name: "notes.txt", path: "notes.txt", size: 50 }];
    expect(buildAttachmentHint(attachments)).toBe(
      "\n\n[Attached: notes.txt (notes.txt)]"
    );
  });
});

describe("stripThinking", () => {
  it("removes Qwen-style <think...</think< blocks", () => {
    const input = "<think Hmm, let me figure this out...<\/think>The answer is 4.";
    expect(stripThinking(input)).toBe("The answer is 4.");
  });

  it("removes <think blocks with case variations", () => {
    const input = "<Think Deep thought...<\/Think>Final answer.";
    expect(stripThinking(input)).toBe("Final answer.");
  });

  it("removes multiple <think blocks", () => {
    const input = "<think Step one...<\/think>Part A <think Step two...<\/think>Part B";
    expect(stripThinking(input)).toBe("Part A Part B");
  });

  it("removes <thinking>...</thinking> blocks", () => {
    const input = "<thinking>I'll reason through this...</thinking>The answer is yes.";
    expect(stripThinking(input)).toBe("The answer is yes.");
  });

  it("leaves plain content unchanged", () => {
    const input = "Hello, world!";
    expect(stripThinking(input)).toBe("Hello, world!");
  });

  it("handles content with only thinking tags (no response)", () => {
    const input = "<think Only thinking here...<\/think>";
    expect(stripThinking(input)).toBe("");
  });

  it("handles empty content", () => {
    expect(stripThinking("")).toBe("");
  });

  it("leaves user messages unchanged (no thinking tags)", () => {
    const input = "What is the capital of France?";
    expect(stripThinking(input)).toBe("What is the capital of France?");
  });

  it("handles content with thinking at the end", () => {
    const input = "The answer is 42<think I guess?<\/think>";
    expect(stripThinking(input)).toBe("The answer is 42");
  });

  it("preserves newlines in the actual response", () => {
    const input = "<think Thinking...<\/think>Here is a list:\n\n1. First\n2. Second";
    expect(stripThinking(input)).toBe("Here is a list:\n\n1. First\n2. Second");
  });
});

// ── buildImageContents ──────────────────────────────────────────────────

describe("buildImageContents", () => {
  beforeEach(() => {
    vi.mocked(readConfinedFileBase64).mockClear();
  });

  it("returns empty array when attachments is undefined", () => {
    expect(buildImageContents(undefined, "/uploads")).toEqual([]);
  });

  it("returns empty array when attachments is empty", () => {
    expect(buildImageContents([], "/uploads")).toEqual([]);
  });

  it("returns empty array when no attachments are vision-compatible", () => {
    expect(buildImageContents(
      [{ name: "data.csv", path: "uploads/data.csv", size: 100, mimeType: "text/csv" }],
      "/uploads",
    )).toEqual([]);
  });

  it("reads image attachments and returns ImageContent[]", () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "iVBORw0KGgo=",
      mimeType: "image/png",
      path: "photo.png",
    });

    const result = buildImageContents(
      [{ name: "photo.png", path: "uploads/photo.png", size: 2048, mimeType: "image/png" }],
      "/data/agents/.agents/my-agent/uploads",
    );

    expect(result).toEqual([
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ]);
    // Should strip "uploads/" prefix since uploadsDir already points there
    expect(readConfinedFileBase64).toHaveBeenCalledWith(
      "/data/agents/.agents/my-agent/uploads",
      "photo.png",
    );
  });

  it("excludes PDF attachments — they are not supported by Ollama's images field", () => {
    const result = buildImageContents(
      [{ name: "report.pdf", path: "uploads/report.pdf", size: 4096, mimeType: "application/pdf" }],
      "/uploads",
    );

    expect(result).toEqual([]);
  });

  it("skips attachments that fail to read", () => {
    vi.mocked(readConfinedFileBase64)
      .mockReturnValueOnce({ data: "abc", mimeType: "image/png", path: "ok.png" })
      .mockReturnValueOnce({ error: "file not found: missing.jpg" });

    const result = buildImageContents(
      [
        { name: "ok.png", path: "uploads/ok.png", size: 100, mimeType: "image/png" },
        { name: "missing.jpg", path: "uploads/missing.jpg", size: 200, mimeType: "image/jpeg" },
      ],
      "/uploads",
    );

    expect(result).toEqual([
      { type: "image", data: "abc", mimeType: "image/png" },
    ]);
  });

  it("uses file extension as fallback when mimeType is missing", () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "iVBOR",
      mimeType: "image/png",
      path: "photo.png",
    });

    const result = buildImageContents(
      [{ name: "photo.png", path: "uploads/photo.png", size: 100 }],
      "/uploads",
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
  });

  it("excludes PDF by extension when mimeType is missing", () => {
    const result = buildImageContents(
      [{ name: "report.pdf", path: "uploads/report.pdf", size: 4096 }],
      "/uploads",
    );

    expect(result).toEqual([]);
  });

  it("mixes image and non-image attachments, only including images", () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "iVBOR",
      mimeType: "image/png",
      path: "photo.png",
    });

    const result = buildImageContents(
      [
        { name: "photo.png", path: "uploads/photo.png", size: 100, mimeType: "image/png" },
        { name: "data.csv", path: "uploads/data.csv", size: 200, mimeType: "text/csv" },
      ],
      "/uploads",
    );

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/png");
  });
});

// ── resolveUploadsDir ──────────────────────────────────────────────────

describe("resolveUploadsDir", () => {
  it("returns workspace uploads dir when workspacePath is set", () => {
    expect(resolveUploadsDir(undefined, undefined, "/workspaces/my-ws")).toBe(
      "/workspaces/my-ws/uploads",
    );
  });

  it("returns agent uploads dir when agentFolderBasePath and agentAlias are set", () => {
    expect(resolveUploadsDir("/data", "my-agent", undefined)).toBe(
      "/data/.agents/my-agent/uploads",
    );
  });

  it("prefers workspacePath over agent path", () => {
    expect(resolveUploadsDir("/data", "my-agent", "/workspaces/ws")).toBe(
      "/workspaces/ws/uploads",
    );
  });

  it("returns undefined when neither path is available", () => {
    expect(resolveUploadsDir(undefined, undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when agentFolderBasePath is set but agentAlias is not", () => {
    expect(resolveUploadsDir("/data", undefined, undefined)).toBeUndefined();
  });
});