/**
 * Shared utility functions used across DB modules and handlers.
 */

/**
 * Return the current time as an ISO 8601 string.
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Generate a new UUID v4.
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Convert a name to a filesystem-safe slug.
 * Lowercase, replace non-alphanumeric runs with a single hyphen,
 * trim leading/trailing hyphens.
 * e.g. "PA 1" → "pa-1", "My Agent #2" → "my-agent-2"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate that required fields are present in a payload.
 *
 * Accepts a record of `{ fieldName: value }` pairs.
 * - For most fields, a falsy value triggers the error (covers `undefined`, `null`, `""`).
 * - For fields listed in `nullableFields`, only `undefined` or `null` triggers the error
 *   (allows empty strings like `content: ""`).
 *
 * Returns the first missing field error string, or `undefined` if all fields are present.
 *
 * @example
 * const err = validateRequired(payload, ["name", "model"]);
 * if (err) { sendResponse(send, id, undefined, err); return; }
 *
 * const err = validateRequired(payload, ["path", "content"], new Set(["content"]));
 */
export function validateRequired(
  fields: Record<string, unknown>,
  requiredKeys: string[],
  nullableFields?: Set<string>,
): string | undefined {
  const nullable = nullableFields ?? new Set();
  for (const key of requiredKeys) {
    const value = fields[key];
    if (nullable.has(key)) {
      if (value === undefined || value === null) {
        return `missing required field: ${key}`;
      }
    } else {
      if (!value) {
        return `missing required field: ${key}`;
      }
    }
  }
  return undefined;
}
