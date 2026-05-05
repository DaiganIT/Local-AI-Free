import type { Request, Response, NextFunction, RequestHandler } from "express";
import { FanOutError, NoHostsError } from "./fanout.js";

// ── Structured error classes ─────────────────────────────────────────────────
// Handlers throw these; the error middleware catches and sends appropriate responses.

export class AppError extends Error {
  /** HTTP status code */
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

// ── Async handler wrapper ────────────────────────────────────────────────────
// Catches thrown errors from async handlers and forwards to Express error middleware.

export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// ── Centralized error middleware ─────────────────────────────────────────────
// Place this after all routes in createApp().

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof FanOutError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof NoHostsError) {
    res.status(502).json({ error: "no hosts connected" });
    return;
  }

  console.error("[error-handler] Unhandled error:", err);
  res.status(500).json({ error: "internal error" });
}