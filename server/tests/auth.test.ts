import { describe, it, expect } from "vitest";
import { checkAuth } from "../src/auth.js";

describe("checkAuth", () => {
  it("returns ok when config is undefined (no auth)", () => {
    expect(checkAuth(undefined, undefined)).toEqual({ ok: true });
  });

  it("returns ok when key matches", () => {
    const config = { allowedKeys: new Set(["secret123"]) };
    expect(checkAuth("secret123", config)).toEqual({ ok: true });
  });

  it("returns unauthorized when key is missing", () => {
    const config = { allowedKeys: new Set(["secret123"]) };
    expect(checkAuth(undefined, config)).toEqual({
      ok: false,
      status: 401,
      message: "unauthorized",
    });
  });

  it("returns forbidden when key is wrong", () => {
    const config = { allowedKeys: new Set(["secret123"]) };
    expect(checkAuth("wrong", config)).toEqual({
      ok: false,
      status: 403,
      message: "forbidden",
    });
  });
});
