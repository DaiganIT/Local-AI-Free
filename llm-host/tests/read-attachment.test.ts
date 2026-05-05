import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReadAttachmentTool } from "../src/tools/read-attachment.js";
import { readConfinedFile, readConfinedFileBase64 } from "../src/handlers/file-confinement.js";
import { extractDocumentText } from "../src/handlers/markitdown.js";
import { extractPdfImages } from "../src/handlers/extract-pdf-images.js";

vi.mock("../src/handlers/file-confinement.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/handlers/file-confinement.js")>();
  return {
    ...actual,
    readConfinedFile: vi.fn(),
    readConfinedFileBase64: vi.fn(),
  };
});

vi.mock("../src/handlers/markitdown.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/handlers/markitdown.js")>();
  return {
    ...actual,
    extractDocumentText: vi.fn(),
  };
});

vi.mock("../src/handlers/extract-pdf-images.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/handlers/extract-pdf-images.js")>();
  return {
    ...actual,
    extractPdfImages: vi.fn(),
  };
});

describe("createReadAttachmentTool", () => {
  beforeEach(() => {
    vi.mocked(readConfinedFile).mockClear();
    vi.mocked(readConfinedFileBase64).mockClear();
    vi.mocked(extractDocumentText).mockClear();
    vi.mocked(extractPdfImages).mockClear();
    // Default: markitdown returns empty string (= extraction failed)
    vi.mocked(extractDocumentText).mockResolvedValue("");
    // Default: no images extracted
    vi.mocked(extractPdfImages).mockResolvedValue([]);
  });

  it("creates a tool with correct name and description", () => {
    const tool = createReadAttachmentTool("/tmp/base", "my-agent");
    expect(tool.name).toBe("read_attachment");
    expect(tool.description).toContain("attachment");
    expect(tool.description).toContain("uploads");
  });

  it("has a parameters schema with a path field", () => {
    const tool = createReadAttachmentTool("/tmp/base", "my-agent");
    expect(tool.parameters).toBeDefined();
    const schema = tool.parameters as any;
    expect(schema.type).toBe("object");
    expect(schema.properties.path).toBeDefined();
    expect(schema.properties.path.type).toBe("string");
  });

  it("reads a file from the uploads directory of the agent", async () => {
    vi.mocked(readConfinedFile).mockReturnValue({
      content: "Hello, world!",
      kind: "text",
      path: "report.txt",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "report.txt" });

    // Should call readConfinedFile with the uploads dir under the agent dir
    expect(readConfinedFile).toHaveBeenCalledWith(
      "/data/agents/.agents/my-agent/uploads",
      "report.txt",
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Hello, world!",
    });
  });

  it("reads a file from the uploads directory of a workspace", async () => {
    vi.mocked(readConfinedFile).mockReturnValue({
      content: "Workspace file content",
      kind: "text",
      path: "notes.md",
    });

    const tool = createReadAttachmentTool("/data/workspaces/my-ws");
    const result = await tool.execute("call-1", { path: "notes.md" });

    expect(readConfinedFile).toHaveBeenCalledWith(
      "/data/workspaces/my-ws/uploads",
      "notes.md",
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Workspace file content",
    });
  });

  it("returns error message when file is not found", async () => {
    vi.mocked(readConfinedFile).mockReturnValue({
      error: "file not found: missing.txt",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "missing.txt" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Error reading attachment: file not found: missing.txt",
    });
  });

  it("returns error message when path is not allowed", async () => {
    vi.mocked(readConfinedFile).mockReturnValue({
      error: "path not allowed",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "../etc/passwd" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Error reading attachment: path not allowed",
    });
  });

  it("strips uploads/ prefix from path if LLM includes it", async () => {
    vi.mocked(readConfinedFile).mockReturnValue({
      content: "CSV data",
      kind: "text",
      path: "data.csv",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "uploads/data.csv" });

    // Should strip the uploads/ prefix since uploadsDir already points there
    expect(readConfinedFile).toHaveBeenCalledWith(
      "/data/agents/.agents/my-agent/uploads",
      "data.csv",
    );
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "CSV data",
    });
  });

  // ── Image files ──────────────────────────────────────────────────────

  it("returns ImageContent for image attachments", async () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "iVBOR...",
      mimeType: "image/png",
      path: "screenshot.png",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "screenshot.png" });

    // Should return both text hint + ImageContent for vision models
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "[Image: screenshot.png]",
    });
    expect(result.content[1]).toMatchObject({
      type: "image",
      data: "iVBOR...",
      mimeType: "image/png",
    });
  });

  it("returns error when readConfinedFileBase64 fails for image", async () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      error: "file not found: photo.jpg",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "photo.jpg" });

    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Error reading attachment: file not found: photo.jpg",
    });
  });

  it("returns ImageContent for JPEG with different extension", async () => {
    vi.mocked(readConfinedFileBase64).mockReturnValue({
      data: "/9j/4AAQ...",
      mimeType: "image/jpeg",
      path: "photo.jpeg",
    });

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "photo.jpeg" });

    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toMatchObject({
      type: "image",
      data: "/9j/4AAQ...",
      mimeType: "image/jpeg",
    });
  });

  // ── PDF files (markitdown extraction) ─────────────────────────────────

  it("returns text content for PDF via markitdown extraction", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue("# Report\n\nPDF content here");

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "report.pdf" });

    // PDFs should be extracted as text, not sent as raw images
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("# Report\n\nPDF content here"),
    });
    // Should NOT contain any ImageContent
    expect(result.content.some((c: any) => c.type === "image")).toBe(false);
  });

  it("extracts text and images from PDF with embedded images", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue("# Report\n\nContent with an image");
    vi.mocked(extractPdfImages).mockResolvedValue([
      { type: "image" as const, data: "imgBase64A", mimeType: "image/png", label: "Image A" },
      { type: "image" as const, data: "imgBase64B", mimeType: "image/jpeg", label: "Image B" },
    ]);

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "report.pdf" });

    // Should contain: text section, image A, label A, image B, label B
    expect(result.content).toHaveLength(5);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[0].text).toContain("# Report\n\nContent with an image");
    expect(result.content[1]).toMatchObject({ type: "image", data: "imgBase64A", mimeType: "image/png" });
    expect(result.content[2]).toMatchObject({ type: "text", text: "[Image A from report.pdf]" });
    expect(result.content[3]).toMatchObject({ type: "image", data: "imgBase64B", mimeType: "image/jpeg" });
    expect(result.content[4]).toMatchObject({ type: "text", text: "[Image B from report.pdf]" });
  });

  it("returns text-only for PDF without embedded images", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue("Just text, no images");
    vi.mocked(extractPdfImages).mockResolvedValue([]);

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "notes.pdf" });

    // Only text content, no images
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[0].text).toContain("Just text, no images");
  });

  it("returns error for PDF when markitdown extraction fails", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue(""); // returns empty string = extraction failed

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "report.pdf" });

    // When extraction fails, should return error message
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Could not extract");
  });

  // ── DOCX files (markitdown extraction, no image extraction) ───────────

  it("returns text content for DOCX via markitdown extraction", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue("# Meeting Notes\n\nAction items...");

    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    const result = await tool.execute("call-1", { path: "meeting.docx" });

    // DOCX should be extracted as text only (no image extraction)
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("# Meeting Notes\n\nAction items...");
    // Should NOT call extractPdfImages for DOCX files
    expect(extractPdfImages).not.toHaveBeenCalled();
  });

  // ── Ensure PDF is NOT treated as a vision file ──────────────────────

  it("does NOT send PDF as raw ImageContent via readConfinedFileBase64", async () => {
    // If PDF were in VISION_EXTENSIONS, it would call readConfinedFileBase64.
    // But PDFs should go through markitdown instead.
    const tool = createReadAttachmentTool("/data/agents", "my-agent");
    await tool.execute("call-1", { path: "report.pdf" });

    // Should call extractDocumentText, NOT readConfinedFileBase64
    expect(extractDocumentText).toHaveBeenCalled();
    expect(readConfinedFileBase64).not.toHaveBeenCalled();
  });
});