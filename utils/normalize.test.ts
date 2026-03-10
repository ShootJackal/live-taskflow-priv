import { describe, expect, it } from "vitest";
import { normalizeCollectorName } from "@/utils/normalize";

describe("normalizeCollectorName", () => {
  it("removes parenthesized suffix and trims whitespace", () => {
    expect(normalizeCollectorName("  Alice Johnson (SF Team)  ")).toBe("Alice Johnson");
  });

  it("preserves names without suffixes", () => {
    expect(normalizeCollectorName("Bruno Diaz")).toBe("Bruno Diaz");
  });
});
