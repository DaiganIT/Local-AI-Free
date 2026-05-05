import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  AppError,
  BadRequestError,
  NotFoundError,
  asyncHandler,
  errorHandler,
} from "../src/error-handler.js";
import { FanOutError, NoHostsError } from "../src/fanout.js";

// ── Error classes ───────────────────────────────────────────────────────────

describe("AppError / BadRequestError / NotFoundError", () => {
  it("AppError has correct status and message", () => {
    const err = new AppError("test", 418);
    expect(err.message).toBe("test");
    expect(err.status).toBe(418);
    expect(err.name).toBe("AppError");
  });

  it("BadRequestError has status 400", () => {
    const err = new BadRequestError("missing field");
    expect(err.status).toBe(400);
    expect(err.message).toBe("missing field");
    expect(err.name).toBe("BadRequestError");
    expect(err).toBeInstanceOf(AppError);
  });

  it("NotFoundError has status 404", () => {
    const err = new NotFoundError("not here");
    expect(err.status).toBe(404);
    expect(err.message).toBe("not here");
    expect(err.name).toBe("NotFoundError");
    expect(err).toBeInstanceOf(AppError);
  });
});

// ── Centralized error middleware ────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Route that throws specific errors
  app.get("/bad-request", (req, res, next) => {
    next(new BadRequestError("missing thing"));
  });
  app.get("/not-found", (req, res, next) => {
    next(new NotFoundError("item gone"));
  });
  app.get("/fanout-error", (req, res, next) => {
    next(new FanOutError("all hosts failed", [new Error("host1 failed")], 502));
  });
  app.get("/fanout-error-404", (req, res, next) => {
    next(new FanOutError("host not found", [], 404));
  });
  app.get("/no-hosts", (req, res, next) => {
    next(new NoHostsError());
  });
  app.get("/unknown", (req, res, next) => {
    next(new Error("something broke"));
  });

  app.use(errorHandler);
  return app;
}

describe("errorHandler middleware", () => {
  it("handles BadRequestError with 400", async () => {
    const app = createTestApp();
    const res = await request(app).get("/bad-request");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "missing thing" });
  });

  it("handles NotFoundError with 404", async () => {
    const app = createTestApp();
    const res = await request(app).get("/not-found");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "item gone" });
  });

  it("handles FanOutError with its status code", async () => {
    const app = createTestApp();
    const res = await request(app).get("/fanout-error");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "all hosts failed" });
  });

  it("handles FanOutError with custom status (404)", async () => {
    const app = createTestApp();
    const res = await request(app).get("/fanout-error-404");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "host not found" });
  });

  it("handles NoHostsError with 502", async () => {
    const app = createTestApp();
    const res = await request(app).get("/no-hosts");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "no hosts connected" });
  });

  it("handles unknown errors with 500", async () => {
    const app = createTestApp();
    const res = await request(app).get("/unknown");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal error" });
  });
});

// ── asyncHandler ────────────────────────────────────────────────────────────

describe("asyncHandler", () => {
  it("passes through successful responses", async () => {
    const app = express();
    app.get("/ok", asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    }));
    app.use(errorHandler);

    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("catches BadRequestError and passes to error middleware", async () => {
    const app = express();
    app.get("/fail", asyncHandler(async (_req, res) => {
      throw new BadRequestError("bad input");
    }));
    app.use(errorHandler);

    const res = await request(app).get("/fail");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad input" });
  });

  it("catches FanOutError and passes to error middleware", async () => {
    const app = express();
    app.get("/fail", asyncHandler(async (_req, res) => {
      throw new FanOutError("all failed", [new Error("e1")], 502);
    }));
    app.use(errorHandler);

    const res = await request(app).get("/fail");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "all failed" });
  });

  it("catches unknown errors with 500", async () => {
    const app = express();
    app.get("/fail", asyncHandler(async (_req, res) => {
      throw new Error("boom");
    }));
    app.use(errorHandler);

    const res = await request(app).get("/fail");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal error" });
  });
});