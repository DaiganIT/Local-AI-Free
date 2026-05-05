/**
 * Convert a name to a filesystem-safe slug.
 * Mirrors the server-side slugify in agents-db.ts.
 * e.g. "PA 1" → "pa-1", "My Agent #2" → "my-agent-2"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
