/**
 * MarkItDown integration for document text extraction.
 * Shells out to the markitdown CLI (Python) to convert documents to Markdown.
 */
import { join, dirname } from "path";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

/**
 * Resolve the path to the markitdown CLI binary.
 * Looks in the .venv inside the llm-host project root.
 */
export function findMarkitdownBin(): string | null {
  // __dirname is .../llm-host/src/handlers -> go up 2 levels to llm-host root
  const projectRoot = join(__dirname, "..", "..");
  const binPath = join(projectRoot, ".venv", "bin", "markitdown");

  if (existsSync(binPath)) {
    return binPath;
  }

  return null;
}

/**
 * Extract text from a document file using MarkItDown.
 * Returns Markdown text on success, empty string on failure.
 * Gracefully handles: markitdown not installed, execution errors, corrupted files.
 */
export async function extractDocumentText(filePath: string): Promise<string> {
  const bin = findMarkitdownBin();
  if (!bin) {
    console.warn("[extractDocumentText] markitdown binary not found in .venv");
    return "";
  }

  console.log(`[extractDocumentText] Extracting text from: ${filePath}`);

  try {
    const { stdout, stderr } = await execFileAsync(bin, [filePath], {
      timeout: 30_000, // 30s timeout for large documents
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.warn(`[extractDocumentText] markitdown stderr: ${stderr}`);
    }

    const text = (stdout || "").trim();
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
    console.log(`[extractDocumentText] Extracted ${text.length} chars from ${filePath}`);
    console.log(`[extractDocumentText] Preview: ${preview}`);
    return text;
  } catch (err) {
    console.warn(`[extractDocumentText] Failed to extract text from ${filePath}:`, err instanceof Error ? err.message : err);
    return "";
  }
}
