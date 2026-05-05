/**
 * Strip thinking blocks from assistant content.
 * Handles <think...</think< tags as well as common variants
 * used by models like Qwen and DeepSeek.
 */

import { join, extname } from "path";
import type { ImageContent } from "@mariozechner/pi-ai";
import { readConfinedFileBase64 } from "./file-confinement.js";

export function stripThinking(content: string): string {
  return content
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

export function buildSystemPrompt(agentsMdContent: string): string {
  return [
    "You are an AI agent. You can modify your own behavior by editing your AGENTS.md file.",
    "",
    "## Your Instructions",
    "",
    agentsMdContent,
    "",
    "## Tools",
    "",
    "You have access to the following tools:",
    "",
    "- `write_agents_md` — overwrites your AGENTS.md file. Use it when the user asks you to change your behavior or personality.",
    "- `read_attachment` — reads an uploaded file from the uploads/ directory. When a user message includes attachments (e.g. `[Attached: report.pdf (report.pdf)]`), use this tool to read the file contents before responding. The path is relative to the uploads/ directory.",
  ].join("\n");
}

/** Attachment reference shape */
interface AttachmentRef {
  name: string;
  path: string;
  size: number;
  mimeType?: string;
}

/** Image MIME types that can be sent to vision models. */
const VISION_MIME_PREFIXES = ["image/"];

/**
 * Determine if an attachment should be sent as image content to the model.
 * Only actual image formats — PDFs and other documents are NOT images and
 * should be read via the `read_attachment` tool instead.
 */
function isVisionAttachment(att: AttachmentRef): boolean {
  if (att.mimeType) {
    return VISION_MIME_PREFIXES.some((prefix) => att.mimeType!.startsWith(prefix));
  }
  // Fallback: check file extension
  const ext = extname(att.name).toLowerCase();
  const visionExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);
  return visionExts.has(ext);
}

/**
 * Read image attachments from disk and build ImageContent[] for the model.
 * Only includes actual image files (PNG, JPG, etc.) — NOT PDFs or other documents,
 * since Ollama's /api/chat `images` field only supports PNG, JPEG, GIF, and WebP.
 * Returns an empty array if no vision attachments or if reads fail.
 */
export function buildImageContents(
  attachments: AttachmentRef[] | undefined | null,
  uploadsDir: string,
): ImageContent[] {
  if (!attachments || attachments.length === 0) return [];

  const images: ImageContent[] = [];

  for (const att of attachments) {
    if (!isVisionAttachment(att)) continue;

    // Strip "uploads/" prefix — the uploads dir is already the base
    const relativePath = att.path.startsWith("uploads/") ? att.path.slice("uploads/".length) : att.path;

    const result = readConfinedFileBase64(uploadsDir, relativePath);

    if ("error" in result) {
      console.warn(`[buildImageContents] Could not read ${att.name}: ${result.error}`);
      continue;
    }

    const preview = result.data.slice(0, 20);
    console.log(`[buildImageContents] Image: ${att.name}, mimeType=${result.mimeType}, base64Length=${result.data.length}, base64Preview=${preview}...`);
    images.push({
      type: "image",
      data: result.data,
      mimeType: result.mimeType,
    });
  }

  return images;
}

/**
 * Resolve the uploads directory for a given context.
 */
export function resolveUploadsDir(
  agentFolderBasePath: string | undefined,
  agentAlias: string | undefined,
  workspacePath: string | undefined,
): string | undefined {
  if (workspacePath) {
    return join(workspacePath, "uploads");
  }
  if (agentFolderBasePath && agentAlias) {
    return join(agentFolderBasePath, ".agents", agentAlias, "uploads");
  }
  return undefined;
}

/**
 * Build a lazy attachment hint string that gets appended to the user prompt.
 * Returns an empty string when there are no attachments.
 * Format: `\n\n[Attached: report.pdf (uploads/report.pdf)]` (one per line)
 */
export function buildAttachmentHint(attachments?: AttachmentRef[] | null): string {
  if (!attachments || attachments.length === 0) return "";
  const lines = attachments.map((a) => {
    // Strip "uploads/" prefix — the read_attachment tool already operates
    // inside the uploads/ directory, so the path must be relative to it.
    const relativePath = a.path.startsWith("uploads/") ? a.path.slice("uploads/".length) : a.path;
    return `[Attached: ${a.name} (${relativePath})]`;
  });
  return "\n\n" + lines.join("\n");
}