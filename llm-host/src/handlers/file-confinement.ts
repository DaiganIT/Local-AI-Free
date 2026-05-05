import { writeFileSync, readFileSync, existsSync, realpathSync, statSync, unlinkSync } from "fs";
import { join, isAbsolute, extname, basename } from "path";
import { isContainedIn } from "../path-security.js";

/** Files that cannot be deleted — they contain the system prompt for the agent. */
export const PROTECTED_FILE_NAMES = new Set(["AGENTS.md"]);

/** File kinds the artifact viewer knows how to render. */
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);

/** Result of reading a confined file */
export type ReadConfinedResult =
  | { content: string; kind: "text"; path: string }
  | { content: string; kind: "image"; path: string }
  | { error: string };

/** Result of reading a confined file as base64 (for sending to vision models). */
export type ReadConfinedBase64Result =
  | { data: string; mimeType: string; path: string }
  | { error: string };

/**
 * Read a file within a confined directory as base64.
 * Same path security as readConfinedFile, but always returns base64
 * regardless of file type. Used for sending files (PDFs, etc.)
 * to vision-capable models.
 */
export function readConfinedFileBase64(baseDir: string, filePath: string): ReadConfinedBase64Result {
  // Path confinement: reject absolute paths and traversal
  if (isAbsolute(filePath) || filePath.includes("..")) {
    return { error: "path not allowed" };
  }

  const absolutePath = join(baseDir, filePath);

  // Resolve symlinks and verify confinement
  if (!existsSync(absolutePath)) {
    return { error: `file not found: ${filePath}` };
  }

  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(absolutePath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  const resolvedBaseDir = realpathSync(baseDir);
  if (!isContainedIn(resolvedBaseDir, resolvedPath)) {
    return { error: "path not allowed" };
  }

  // Verify it's a file, not a directory
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(resolvedPath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  if (!stat.isFile()) {
    return { error: `not a file: ${filePath}` };
  }

  const ext = extname(filePath).toLowerCase();
  const mime = imageMime(ext) !== "application/octet-stream" ? imageMime(ext) : extensionMime(ext);

  try {
    const buffer = readFileSync(resolvedPath);
    return { data: buffer.toString("base64"), mimeType: mime, path: filePath };
  } catch {
    return { error: `failed to read file: ${filePath}` };
  }
}

/** Map file extension to MIME type (for non-image files). */
function extensionMime(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Result of writing a confined file */
export type WriteConfinedResult =
  | { success: true; path: string }
  | { error: string };

/** Result of deleting a confined file */
export type DeleteConfinedResult =
  | { success: true; path: string }
  | { error: string };

/**
 * Read a file within a confined directory, enforcing path security.
 * The baseDir should already be the resolved root (e.g. agent dir or workspace dir).
 * The path must be relative and not contain traversal.
 */
export function readConfinedFile(baseDir: string, filePath: string): ReadConfinedResult {
  // Path confinement: reject absolute paths and traversal
  if (isAbsolute(filePath) || filePath.includes("..")) {
    return { error: "path not allowed" };
  }

  const absolutePath = join(baseDir, filePath);

  // Resolve symlinks and verify confinement
  if (!existsSync(absolutePath)) {
    return { error: `file not found: ${filePath}` };
  }

  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(absolutePath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  const resolvedBaseDir = realpathSync(baseDir);
  if (!isContainedIn(resolvedBaseDir, resolvedPath)) {
    return { error: "path not allowed" };
  }

  // Verify it's a file, not a directory
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(resolvedPath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  if (!stat.isFile()) {
    return { error: `not a file: ${filePath}` };
  }

  const ext = extname(filePath).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext);

  if (isImage) {
    const buffer = readFileSync(resolvedPath);
    const base64 = buffer.toString("base64");
    const mime = imageMime(ext);
    return { content: `data:${mime};base64,${base64}`, kind: "image", path: filePath };
  } else {
    const content = readFileSync(resolvedPath, "utf-8");
    return { content, kind: "text", path: filePath };
  }
}

/**
 * Write a file within a confined directory, enforcing path security.
 * The baseDir should already be the resolved root.
 * The path must be relative and not contain traversal.
 */
export function writeConfinedFile(baseDir: string, filePath: string, content: string | Buffer): WriteConfinedResult {
  // Path confinement: reject absolute paths and traversal
  if (isAbsolute(filePath) || filePath.includes("..")) {
    return { error: "path not allowed" };
  }

  const absolutePath = join(baseDir, filePath);

  // Verify confinement by resolving symlinks
  let resolvedBaseDir: string;
  try {
    resolvedBaseDir = realpathSync(baseDir);
  } catch {
    return { error: "workspace directory not found" };
  }

  // If the file (or any path component) already exists, resolve it and check confinement
  if (existsSync(absolutePath)) {
    try {
      const resolvedTarget = realpathSync(absolutePath);
      if (!isContainedIn(resolvedBaseDir, resolvedTarget)) {
        return { error: "path not allowed" };
      }
    } catch {
      // Can't resolve — treat as path not allowed
      return { error: "path not allowed" };
    }
  } else {
    // File doesn't exist yet — verify the parent directory is confined
    const dirPath = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
    if (dirPath) {
      const absDirPath = join(baseDir, dirPath);
      if (existsSync(absDirPath)) {
        try {
          const resolvedDir = realpathSync(absDirPath);
          if (!isContainedIn(resolvedBaseDir, resolvedDir)) {
            return { error: "path not allowed" };
          }
        } catch {
          return { error: "path not allowed" };
        }
      }
    }
    // Also check: is any intermediate component a symlink pointing outside?
    // Walk the path components
    const parts = filePath.split("/");
    let checkPath = baseDir;
    for (const part of parts.slice(0, -1)) {
      checkPath = join(checkPath, part);
      if (existsSync(checkPath)) {
        try {
          const resolved = realpathSync(checkPath);
          if (!isContainedIn(resolvedBaseDir, resolved)) {
            return { error: "path not allowed" };
          }
        } catch {
          return { error: "path not allowed" };
        }
      }
    }
  }

  try {
    if (typeof content === "string") {
      writeFileSync(absolutePath, content, "utf-8");
    } else {
      writeFileSync(absolutePath, content);
    }
    return { success: true, path: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to write file";
    return { error: message };
  }
}

/**
 * Delete a file within a confined directory, enforcing path security.
 * The baseDir should already be the resolved root.
 * The path must be relative, not contain traversal, and point to a file (not a directory).
 */
export function deleteConfinedFile(baseDir: string, filePath: string): DeleteConfinedResult {
  // Path confinement: reject absolute paths and traversal
  if (isAbsolute(filePath) || filePath.includes("..")) {
    return { error: "path not allowed" };
  }

  // Protected files: reject deletion of system prompt files
  if (PROTECTED_FILE_NAMES.has(basename(filePath))) {
    return { error: `cannot delete protected file: ${basename(filePath)}` };
  }

  const absolutePath = join(baseDir, filePath);

  // File must exist
  if (!existsSync(absolutePath)) {
    return { error: `file not found: ${filePath}` };
  }

  // Resolve symlinks and verify confinement
  let resolvedPath: string;
  try {
    resolvedPath = realpathSync(absolutePath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  const resolvedBaseDir = realpathSync(baseDir);
  if (!isContainedIn(resolvedBaseDir, resolvedPath)) {
    return { error: "path not allowed" };
  }

  // Verify it's a file, not a directory
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(resolvedPath);
  } catch {
    return { error: `file not found: ${filePath}` };
  }

  if (!stat.isFile()) {
    return { error: `not a file: ${filePath}` };
  }

  try {
    unlinkSync(resolvedPath);
    return { success: true, path: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to delete file";
    return { error: message };
  }
}

export function imageMime(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
  };
  return map[ext] ?? "application/octet-stream";
}
