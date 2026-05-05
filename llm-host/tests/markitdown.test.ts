import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractDocumentText, findMarkitdownBin } from "../src/handlers/markitdown.js";
import { existsSync } from "fs";
import * as childProcess from "child_process";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

// Mock promisify to return the same function — our code calls execFile through promisify
vi.mock("util", () => ({
  promisify: vi.fn((fn) => fn),
}));

describe("extractDocumentText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty string when markitdown binary is not found", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await extractDocumentText("/some/file.pdf");
    expect(result).toBe("");
  });

  it("returns markdown text from markitdown output", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: "# Hello\n\nSome text from the PDF", stderr: "" }),
    );

    const result = await extractDocumentText("/uploads/report.pdf");
    expect(result).toBe("# Hello\n\nSome text from the PDF");
  });

  it("passes the file path to markitdown", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: "content", stderr: "" }),
    );

    await extractDocumentText("/uploads/report.pdf");

    expect(childProcess.execFile).toHaveBeenCalledWith(
      expect.any(String),
      ["/uploads/report.pdf"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("returns empty string on markitdown execution error", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(childProcess.execFile).mockImplementation(
      () => Promise.reject(new Error("spawn error")),
    );

    const result = await extractDocumentText("/uploads/bad.pdf");
    expect(result).toBe("");
  });

  it("returns empty string when markitdown outputs only stderr", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(childProcess.execFile).mockImplementation(
      () => Promise.resolve({ stdout: "", stderr: "some error" }),
    );

    const result = await extractDocumentText("/uploads/bad.pdf");
    expect(result).toBe("");
  });
});

describe("findMarkitdownBin", () => {
  it("returns null when venv binary does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findMarkitdownBin()).toBeNull();
  });
});
