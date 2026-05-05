import type { Response } from "express";
import { BadRequestError } from "./error-handler.js";

// ── Validation helpers (throw-based) ─────────────────────────────────────────
// These throw BadRequestError if validation fails.
// Designed to work with the centralized error middleware via asyncHandler.

/** Require a route param to be truthy. Throws BadRequestError if falsy. */
export function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestError(`missing required param: ${name}`);
  }
  return value;
}

/** Require a body field to be truthy. Throws BadRequestError if falsy. */
export function requireField(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestError(`missing required field: ${name}`);
  }
  return value;
}

/** Require a query param to be truthy. Throws BadRequestError if falsy. */
export function requireQuery(value: string | undefined, name: string): string {
  if (!value) {
    throw new BadRequestError(`missing required query param: ${name}`);
  }
  return value;
}

// ── Response-based helpers (legacy) ──────────────────────────────────────────
// These send responses directly. Kept for backwards compat with tests.
// New code should prefer the throw-based versions above.

export function missingParam(res: Response, param: string): false {
  res.status(400).json({ error: `missing required param: ${param}` });
  return false;
}

export function missingField(res: Response, field: string): false {
  res.status(400).json({ error: `missing required field: ${field}` });
  return false;
}

export function missingQuery(res: Response, param: string): false {
  res.status(400).json({ error: `missing required query param: ${param}` });
  return false;
}

export function noHostsConnected(res: Response): false {
  res.status(502).json({ error: "no hosts connected" });
  return false;
}

export function hostNotFound(res: Response, hostId: string): false {
  res.status(404).json({ error: `host '${hostId}' not found or not connected` });
  return false;
}