import { describe, it, expect } from "vitest";
import { now, uuid, slugify, validateRequired } from "../src/utils.js";

describe("utils", () => {
  describe("now", () => {
    it("returns an ISO 8601 string", () => {
      const result = now();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("uuid", () => {
    it("returns a valid UUID v4", () => {
      const result = uuid();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });

  describe("slugify", () => {
    it("converts to lowercase slug", () => {
      expect(slugify("PA 1")).toBe("pa-1");
    });

    it("replaces special characters", () => {
      expect(slugify("My Agent #2")).toBe("my-agent-2");
    });

    it("trims leading/trailing hyphens", () => {
      expect(slugify("-leading-trailing-")).toBe("leading-trailing");
    });
  });

  describe("validateRequired", () => {
    it("returns undefined when all fields are present", () => {
      expect(validateRequired({ name: "foo", model: "bar" }, ["name", "model"])).toBeUndefined();
    });

    it("returns error for first missing field", () => {
      expect(validateRequired({ name: "" }, ["name", "model"])).toBe("missing required field: name");
    });

    it("returns error for null field", () => {
      expect(validateRequired({ name: null }, ["name"])).toBe("missing required field: name");
    });

    it("returns error for undefined field", () => {
      expect(validateRequired({ name: undefined }, ["name"])).toBe("missing required field: name");
    });

    it("skips missing fields not in requiredKeys", () => {
      expect(validateRequired({ name: "foo" }, ["name"])).toBeUndefined();
    });

    it("allows empty string for nullable fields", () => {
      expect(
        validateRequired({ content: "" }, ["content"], new Set(["content"]))
      ).toBeUndefined();
    });

    it("rejects null for nullable fields", () => {
      expect(
        validateRequired({ content: null }, ["content"], new Set(["content"]))
      ).toBe("missing required field: content");
    });

    it("rejects undefined for nullable fields", () => {
      expect(
        validateRequired({ content: undefined }, ["content"], new Set(["content"]))
      ).toBe("missing required field: content");
    });

    it("checks fields in order and returns first error", () => {
      expect(
        validateRequired({ model: "bar" }, ["name", "model"])
      ).toBe("missing required field: name");
    });
  });
});
