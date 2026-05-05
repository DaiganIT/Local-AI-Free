import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractPdfImages, type ExtractedImage } from "../src/handlers/extract-pdf-images.js";
import * as childProcess from "child_process";
import fs from "fs";
import path from "path";

// Mock child_process to control execFile results
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("util", () => ({
  promisify: vi.fn((fn) => fn),
}));

// Import the mocked module
const mockExecFile = vi.mocked(childProcess.execFile);

describe("extractPdfImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses JSON output from the Python script", async () => {
    const pythonOutput = JSON.stringify([
      { label: "Image A", mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg..." },
      { label: "Image B", mimeType: "image/png", data: "iVBORw0KGgo..." },
    ]);

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: pythonOutput, stderr: "" }),
    );

    const result = await extractPdfImages("/path/to/test.pdf");

    expect(result).toEqual([
      { type: "image", label: "Image A", mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg..." },
      { type: "image", label: "Image B", mimeType: "image/png", data: "iVBORw0KGgo..." },
    ]);

    // Should call python with the script path and file path
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.stringContaining("python3"),
      [expect.stringContaining("extract_pdf_images.py"), "/path/to/test.pdf"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("returns empty array when Python outputs empty array", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: "[]", stderr: "" }),
    );

    const result = await extractPdfImages("/path/to/text-only.pdf");
    expect(result).toEqual([]);
  });

  it("returns empty array on execFile error", async () => {
    mockExecFile.mockImplementation(
      () => Promise.reject(new Error("Python not found")),
    );

    const result = await extractPdfImages("/path/to/test.pdf");
    expect(result).toEqual([]);
  });

  it("returns empty array on invalid JSON output", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: "not json", stderr: "" }),
    );

    const result = await extractPdfImages("/path/to/test.pdf");
    expect(result).toEqual([]);
  });

  it("returns empty array on empty stdout", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: "", stderr: "" }),
    );

    const result = await extractPdfImages("/path/to/test.pdf");
    expect(result).toEqual([]);
  });

  it("still returns images when stderr has warnings", async () => {
    const pythonOutput = JSON.stringify([
      { label: "Image A", mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg..." },
    ]);

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any) =>
        Promise.resolve({ stdout: pythonOutput, stderr: "Warning: Skipping image with unsupported filters: ['/CCITTFaxDecode']" }),
    );

    const result = await extractPdfImages("/path/to/test.pdf");
    expect(result).toEqual([
      { type: "image", label: "Image A", mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg..." },
    ]);
  });
});