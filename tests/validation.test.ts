import { describe, expect, it } from "vitest";

import {
  normalizeOrderId,
  parseAmount,
  sanitizeText,
} from "../src/validation.js";

describe("validation", () => {
  it("normalizes safe order ids", () => {
    expect(normalizeOrderId("order:42-A")).toBe("order:42-A");
    expect(() => normalizeOrderId("order 42")).toThrow("order-id");
  });

  it("limits amount precision and magnitude", () => {
    expect(parseAmount("1.25")).toBe(1.25);
    expect(() => parseAmount(-1)).toThrow();
    expect(() => parseAmount(1_000_001)).toThrow("safety ceiling");
  });

  it("removes control characters and clamps user-facing text", () => {
    expect(sanitizeText("hello\u0000world", "fallback")).toBe("hello world");
    expect(sanitizeText("a".repeat(200), "fallback", 10)).toBe("a".repeat(10));
  });
});
