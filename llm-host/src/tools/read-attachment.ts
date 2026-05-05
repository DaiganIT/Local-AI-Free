/**
 * read_attachment tool — allows the agent to read uploaded files from the
 * `uploads/` directory inside its agent folder or workspace folder.
 * This is a "ghost tool" — always added to the agent's tools (like
 * `write_agents_md`) so the agent can access user-uploaded attachments.
 *
 * This is the ONLY way an agent gets file data — there is no prompt-injected
 * context of the file. The tool behaves differently depending on file type:
 *
 * - Image files (PNG, JPG, etc.) → returned as ImageContent so vision models
 *   can see them, plus a text hint like [Image: photo.png].
 * - Text files (.txt, .md, .csv, .html) → read as string and returned as
 *   TextContent.
 * - Document files (.pdf, .docx, .doc, .pptx, .xlsx, .xls) → text is
 *   extracted via markitdown. For PDFs, embedded images are also extracted
 *   and returned as ImageContent alongside the text.
 */
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { join, extname } from "path";
import { readConfinedFile, readConfinedFileBase64, IMAGE_EXTENSIONS } from "../handlers/file-confinement.js";
import { extractDocumentText } from "../handlers/markitdown.js";
import { extractPdfImages } from "../handlers/extract-pdf-images.js";
import type { ImageContent } from "@mariozechner/pi-ai";

/** Extensions for files that should be sent as ImageContent (images only).
 * PDFs are NOT included because Ollama's /api/chat `images` field only
 * supports PNG, JPEG, GIF, and WebP — use markitdown + extractPdfImages for PDFs.
 */
const VISION_EXTENSIONS = new Set(IMAGE_EXTENSIONS);

/** Document extensions that need markitdown conversion (binary formats).
 * Plain text formats (.txt, .md, .csv, .html) are read directly by readConfinedFile.
 */
const MARKITDOWN_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".xls",
]);

const ReadAttachmentParams = Type.Object({
  path: Type.String({
    description:
      "Path to the attachment file, relative to the uploads/ directory. Example: 'report.pdf' or 'data/notes.txt'.",
  }),
});

export type ReadAttachmentParams = typeof ReadAttachmentParams;

/**
 * Create a read_attachment tool for the given base path.
 *
 * For agents: basePath is the workspace root, and uploads live at
 *   `<basePath>/.agents/<alias>/uploads/`
 * For workspaces: basePath is the workspace dir, and uploads live at
 *   `<basePath>/uploads/`
 *
 * The optional `agentAlias` determines which mode to use.
 */
export function createReadAttachmentTool(
  basePath: string,
  agentAlias?: string,
): AgentTool<ReadAttachmentParams, { path: string }> {
  const uploadsDir = agentAlias
    ? join(basePath, ".agents", agentAlias, "uploads")
    : join(basePath, "uploads");

  return {
    name: "read_attachment",
    label: "Read Attachment",
    description:
      "Read an uploaded attachment file from the uploads/ directory. " +
      "Use this when a user message includes an attachment and you need to read its contents. " +
      "The path is relative to the uploads/ directory.",
    parameters: ReadAttachmentParams,
    async execute(
      _toolCallId: string,
      params: { path: string },
      _signal?: AbortSignal,
    ): Promise<AgentToolResult<{ path: string }>> {
      // Strip "uploads/" prefix if the LLM includes it — we're already inside uploads/
      const cleanPath = params.path.startsWith("uploads/")
        ? params.path.slice("uploads/".length)
        : params.path;
      console.log(`[read_attachment] path='${params.path}' cleanPath='${cleanPath}' uploadsDir='${uploadsDir}'`);

      const ext = extname(cleanPath).toLowerCase();

      // Image files: send as ImageContent so vision models can see them
      if (VISION_EXTENSIONS.has(ext)) {
        const result = readConfinedFileBase64(uploadsDir, cleanPath);

        if ("error" in result) {
          console.log(`[read_attachment] ERROR: ${result.error}`);
          return {
            content: [{ type: "text", text: `Error reading attachment: ${result.error}` }],
            details: { path: params.path },
          };
        }

        console.log(`[read_attachment] OK: read ${ext} file as ImageContent (${result.mimeType}) from ${result.path}`);
        return {
          content: [
            { type: "text", text: `[Image: ${cleanPath}]` },
            { type: "image", data: result.data, mimeType: result.mimeType },
          ],
          details: { path: result.path },
        };
      }

      // PDF and other binary documents: extract text via markitdown, and for PDFs
      // also extract embedded images
      if (MARKITDOWN_EXTENSIONS.has(ext)) {
        const absolutePath = join(uploadsDir, cleanPath);
        const text = await extractDocumentText(absolutePath);

        if (text.length > 0) {
          const content: Array<{ type: "text"; text: string } | ImageContent> = [
            { type: "text", text: `---\n# ${cleanPath}\n\n${text}\n---` },
          ];

          // For PDFs, also extract embedded images
          if (ext === ".pdf") {
            console.log(`[read_attachment] ${cleanPath} is a PDF, extracting embedded images...`);
            const pdfImages = await extractPdfImages(absolutePath);
            console.log(`[read_attachment] Found ${pdfImages.length} image(s) in PDF ${cleanPath}`);
            for (const img of pdfImages) {
              content.push({ type: "image", data: img.data, mimeType: img.mimeType });
              // Add a text label so the model knows what each image is
              content.push({ type: "text", text: `[${img.label} from ${cleanPath}]` });
            }
          }

          console.log(`[read_attachment] OK: read ${ext} file as text (${text.length} chars) from ${cleanPath}`);
          return {
            content,
            details: { path: cleanPath },
          };
        }

        // Extraction failed — return a useful error message
        console.log(`[read_attachment] ERROR: could not extract text from ${cleanPath}`);
        return {
          content: [{ type: "text", text: `Could not extract text from ${cleanPath}. The file may be corrupted or the extraction tool is not available.` }],
          details: { path: params.path },
        };
      }

      // Text files: read as string
      const result = readConfinedFile(uploadsDir, cleanPath);

      if ("error" in result) {
        console.log(`[read_attachment] ERROR: ${result.error}`);
        return {
          content: [{ type: "text", text: `Error reading attachment: ${result.error}` }],
          details: { path: params.path },
        };
      }

      console.log(`[read_attachment] OK: read ${result.content.length} chars from ${result.path}`);
      return {
        content: [{ type: "text", text: result.content }],
        details: { path: result.path },
      };
    },
  };
}