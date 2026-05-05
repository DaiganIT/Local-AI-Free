import type { RequestHandler } from "express";

/** When auth is enabled, `allowedKeys` must be non-empty. */
export interface AuthConfig {
  allowedKeys: Set<string>;
}

export function checkAuth(
  key: string | undefined,
  config: AuthConfig | undefined
): { ok: true } | { ok: false, status: 401 | 403, message: string } {
  // No config, or config with empty/undefined keys = auth is disabled
  if (!config?.allowedKeys?.size) return { ok: true };
  if (!key) return { ok: false, status: 401, message: "unauthorized" };
  if (!config.allowedKeys.has(key))
    return { ok: false, status: 403, message: "forbidden" };
  return { ok: true };
}

/** Express middleware that requires a valid API key. Skips if auth is not configured. */
export function requireAuth(auth?: AuthConfig): RequestHandler {
  return (req, res, next) => {
    const result = checkAuth(req.header("X-API-Key"), auth);
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    next();
  };
}