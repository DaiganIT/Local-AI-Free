import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  missingParam,
  missingField,
  missingQuery,
  noHostsConnected,
  hostNotFound,
  requireParam,
  requireField,
  requireQuery,
} from "../src/validate.js";
import { BadRequestError } from "../src/error-handler.js";

// ── Helper: create a minimal Express app with a route that uses the helper ──

function appWith(helper: (res: express.Response) => false) {
  const app = express();
  app.get("/test", (req, res) => {
    helper(res);
  });
  return app;
}

// Helper: app with error middleware that catches BadRequestError from throw-based validation
function appWithThrow(handler: (req: express.Request, res: express.Response) => void) {
  const app = express();
  app.get("/test", (req, res) => {
    try {
      handler(req, res);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof BadRequestError) {
        res.status(err.status).json({ error: err.message });
      } else {
        res.status(500).json({ error: "internal error" });
      }
    }
  });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("validate helpers", () => {
  it("missingParam sends 400 with param name", async () => {
    const app = appWith((res) => missingParam(res, "agentId"));
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required param: agentId" });
  });

  it("missingField sends 400 with field name", async () => {
    const app = appWith((res) => missingField(res, "prompt"));
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required field: prompt" });
  });

  it("missingQuery sends 400 with param name", async () => {
    const app = appWith((res) => missingQuery(res, "path"));
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required query param: path" });
  });

  it("noHostsConnected sends 502", async () => {
    const app = appWith((res) => noHostsConnected(res));
    const res = await request(app).get("/test");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "no hosts connected" });
  });

  it("hostNotFound sends 404 with hostId", async () => {
    const app = appWith((res) => hostNotFound(res, "host-123"));
    const res = await request(app).get("/test");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "host 'host-123' not found or not connected" });
  });
});

describe("requireParam (throw-based)", () => {
  it("returns the value when present", () => {
    const result = requireParam("abc", "agentId");
    expect(result).toBe("abc");
  });

  it("throws BadRequestError when value is undefined", () => {
    expect(() => requireParam(undefined, "agentId")).toThrow(BadRequestError);
    expect(() => requireParam(undefined, "agentId")).toThrow("missing required param: agentId");
  });

  it("throws BadRequestError when value is empty string", () => {
    expect(() => requireParam("", "agentId")).toThrow(BadRequestError);
  });

  it("sends 400 when used in Express route with error handling", async () => {
    const app = appWithThrow((req, res) => {
      requireParam(undefined, "agentId");
    });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required param: agentId" });
  });
});

describe("requireField (throw-based)", () => {
  it("returns the value when present", () => {
    const result = requireField("hello", "prompt");
    expect(result).toBe("hello");
  });

  it("throws BadRequestError when value is undefined", () => {
    expect(() => requireField(undefined, "prompt")).toThrow(BadRequestError);
    expect(() => requireField(undefined, "prompt")).toThrow("missing required field: prompt");
  });

  it("sends 400 when used in Express route with error handling", async () => {
    const app = appWithThrow((req, res) => {
      requireField(undefined, "prompt");
    });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required field: prompt" });
  });
});

describe("requireQuery (throw-based)", () => {
  it("returns the value when present", () => {
    const result = requireQuery("somepath", "path");
    expect(result).toBe("somepath");
  });

  it("throws BadRequestError when value is undefined", () => {
    expect(() => requireQuery(undefined, "path")).toThrow(BadRequestError);
    expect(() => requireQuery(undefined, "path")).toThrow("missing required query param: path");
  });

  it("sends 400 when used in Express route with error handling", async () => {
    const app = appWithThrow((req, res) => {
      requireQuery(undefined, "path");
    });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing required query param: path" });
  });
});