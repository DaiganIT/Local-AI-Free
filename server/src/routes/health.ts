import type { RequestHandler } from "express";

export const getHealth: RequestHandler = (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
};