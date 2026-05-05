import { Router } from "express";
import type { Registry } from "../registry.js";
import type { AuthConfig } from "../auth.js";
import { requireAuth } from "../auth.js";

export function createHostsRouter(registry: Registry, auth?: AuthConfig): Router {
  const router = Router();
  router.get("/", requireAuth(auth), (_req, res) => {
    res.json(registry.listHosts());
  });
  return router;
}