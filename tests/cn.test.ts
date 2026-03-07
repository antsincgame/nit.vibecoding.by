import { describe, it, expect } from "vitest";
import { cn } from "~/lib/utils/cn";

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", false && "hidden", true && "visible")).toBe("base visible");
  });

  it("should handle object syntax", () => {
    expect(cn({ active: true, disabled: false })).toBe("active");
  });

  it("should handle empty input", () => {
    expect(cn()).toBe("");
  });

  it("should filter undefined and null", () => {
    expect(cn("a", undefined, "b", null)).toBe("a b");
  });

  it("should handle arrays", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });
});
