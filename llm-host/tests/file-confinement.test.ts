import { describe, it, expect, beforeEach, vi } from "vitest";
import { writeConfinedFile, readConfinedFileBase64 } from "../src/handlers/file-confinement.js";
import { writeFileSync, readFileSync, existsSync, realpathSync, statSync } from "fs";
import { join } from "path";
import { Buffer } from "buffer";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    realpathSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe("writeConfinedFile", () => {
  const baseDir = "/tmp/test-confined";

  beforeEach(() => {
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(statSync).mockClear();
  });

  it("writes string content with utf-8 encoding", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const result = writeConfinedFile(baseDir, "test.txt", "hello world");

    expect(result).toEqual({ success: true, path: "test.txt" });
    expect(writeFileSync).toHaveBeenCalledWith(
      join(baseDir, "test.txt"),
      "hello world",
      "utf-8",
    );
  });

  it("writes Buffer content without encoding", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const buf = Buffer.from("iVBORw0KGgo=", "base64");
    const result = writeConfinedFile(baseDir, "image.png", buf);

    expect(result).toEqual({ success: true, path: "image.png" });
    expect(writeFileSync).toHaveBeenCalledWith(
      join(baseDir, "image.png"),
      buf,
    );
  });

  it("writes empty Buffer", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);

    const buf = Buffer.alloc(0);
    const result = writeConfinedFile(baseDir, "empty.bin", buf);

    expect(result).toEqual({ success: true, path: "empty.bin" });
    expect(writeFileSync).toHaveBeenCalledWith(
      join(baseDir, "empty.bin"),
      buf,
    );
  });
});

// ── readConfinedFileBase64 ─────────────────────────────────────────────

describe("readConfinedFileBase64", () => {
  const baseDir = "/tmp/test-confined";

  beforeEach(() => {
    vi.mocked(readFileSync).mockClear();
    vi.mocked(existsSync).mockClear();
    vi.mocked(realpathSync).mockClear();
    vi.mocked(statSync).mockClear();
  });

  it("reads a file and returns base64 data with mimeType", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("fake-pdf-content"));

    const result = readConfinedFileBase64(baseDir, "report.pdf");

    expect("error" in result).toBe(false);
    if ("data" in result) {
      expect(result.mimeType).toBe("application/pdf");
      expect(result.data).toBe(Buffer.from("fake-pdf-content").toString("base64"));
      expect(result.path).toBe("report.pdf");
    }
  });

  it("returns image mimeType for image extensions", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("fake-image"));

    const result = readConfinedFileBase64(baseDir, "photo.png");

    if ("data" in result) {
      expect(result.mimeType).toBe("image/png");
    }
  });

  it("returns error for absolute paths", () => {
    const result = readConfinedFileBase64(baseDir, "/etc/passwd");
    expect(result).toEqual({ error: "path not allowed" });
  });

  it("returns error for path traversal", () => {
    const result = readConfinedFileBase64(baseDir, "../../../etc/passwd");
    expect(result).toEqual({ error: "path not allowed" });
  });

  it("returns error when file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = readConfinedFileBase64(baseDir, "missing.pdf");
    expect(result).toEqual({ error: "file not found: missing.pdf" });
  });

  it("returns error when path is a directory", () => {
    vi.mocked(realpathSync).mockImplementation((p: string) => p);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isFile: () => false } as any);

    const result = readConfinedFileBase64(baseDir, "somedir");
    expect(result).toEqual({ error: "not a file: somedir" });
  });
});
