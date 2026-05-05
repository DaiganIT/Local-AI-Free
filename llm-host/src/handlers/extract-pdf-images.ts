/**
 * Extract embedded images from PDF files.
 *
 * Shells out to a Python script that uses pdfplumber + PIL to:
 * - Extract JPEG/JPEG2000 images directly (raw stream data)
 * - Re-encode FlateDecode (raw pixel) images as PNG
 *
 * Returns labeled ImageContent objects (Image A, Image B, ...) suitable
 * for sending to vision models via Ollama's `images` field.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ImageContent } from "@mariozechner/pi-ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

/** An extracted image with a human-readable label for the prompt. */
export interface ExtractedImage extends ImageContent {
  /** Sequential label: "Image A", "Image B", etc. */
  label: string;
}

/** Parsed result from the Python script. */
interface PythonImageResult {
  label: string;
  mimeType: string;
  data: string;
}

/**
 * Locate the extract_pdf_images.py script.
 * Lives in the scripts/ directory next to the llm-host project root.
 */
function getScriptPath(): string {
  const projectRoot = join(__dirname, "..", "..");
  return join(projectRoot, "scripts", "extract_pdf_images.py");
}

/**
 * Locate the Python binary in the project's virtual environment.
 */
function getPythonBin(): string {
  const projectRoot = join(__dirname, "..", "..");
  return join(projectRoot, ".venv", "bin", "python3");
}

/**
 * Extract embedded images from a PDF file.
 * Returns an array of labeled images (Image A, Image B, ...).
 * Returns an empty array if the file has no images or on error.
 */
export async function extractPdfImages(filePath: string): Promise<ExtractedImage[]> {
  const scriptPath = getScriptPath();
  const pythonBin = getPythonBin();

  console.log(`[extractPdfImages] Extracting images from: ${filePath}`);

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, [scriptPath, filePath], {
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large PDFs with many images
    });

    if (stderr) {
      console.warn(`[extractPdfImages] stderr: ${stderr}`);
    }

    if (!stdout || !stdout.trim()) {
      console.log(`[extractPdfImages] No images found in ${filePath}`);
      return [];
    }

    const parsed: PythonImageResult[] = JSON.parse(stdout);

    const images = parsed.map((item) => ({
      type: "image" as const,
      data: item.data,
      mimeType: item.mimeType,
      label: item.label,
    }));

    console.log(`[extractPdfImages] Extracted ${images.length} image(s) from ${filePath}`);
    for (const img of images) {
      console.log(`[extractPdfImages]   ${img.label}: ${img.mimeType}, ${Math.round(img.data.length * 3 / 4)} bytes (base64 length: ${img.data.length})`);
    }

    return images;
  } catch (err) {
    console.warn(
      `[extractPdfImages] Failed to extract images from ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}