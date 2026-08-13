import { describe, expect, it } from "vitest";
import { dateFilterToIso, formatDateFilterInput } from "./dateFilter";

describe("date filter input", () => {
  it("formats typed digits as yyyy/mm/dd", () => {
    expect(formatDateFilterInput("20260814")).toBe("2026/08/14");
    expect(formatDateFilterInput("2026-08-14")).toBe("2026/08/14");
    expect(formatDateFilterInput("20260")).toBe("2026/0");
  });

  it("converts complete valid dates to ISO filter values", () => {
    expect(dateFilterToIso("2026/08/14")).toBe("2026-08-14");
    expect(dateFilterToIso("2026/02/29")).toBeUndefined();
    expect(dateFilterToIso("2026/8/14")).toBeUndefined();
    expect(dateFilterToIso("")).toBeUndefined();
  });
});
