import { relative, sep, isAbsolute } from "path";

/**
 * Check whether `targetResolved` is contained within `rootResolved`.
 * Both paths must already be resolved (realpath'd) — no symlink traversal here.
 *
 * Returns true if target is the root itself or a descendant of it.
 */
export function isContainedIn(rootResolved: string, targetResolved: string): boolean {
  const rel = relative(rootResolved, targetResolved);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}
