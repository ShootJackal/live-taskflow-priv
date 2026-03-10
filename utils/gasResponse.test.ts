import { describe, expect, it } from "vitest";
import { parseGasResponseText, stripJsonHijackPrefix } from "@/utils/gasResponse";

describe("GAS response parser", () => {
  it("removes JSON hijack prefix", () => {
    expect(stripJsonHijackPrefix(`)]}'\n{"success":true}`)).toBe(`{"success":true}`);
  });

  it("parses valid payloads", () => {
    const parsed = parseGasResponseText<{ value: number }>("{\"success\":true,\"data\":{\"value\":7}}");
    expect(parsed.success).toBe(true);
    expect(parsed.data?.value).toBe(7);
  });

  it("throws clean response text when payload is invalid", () => {
    expect(() => parseGasResponseText("service unavailable")).toThrow("service unavailable");
  });
});
