import { describe, expect, it } from "vitest";
import { averageProfileHabits } from "./profileHabits";

describe("averageProfileHabits", () => {
  it("averages each field over the profiles that report it", () => {
    const average = averageProfileHabits([
      { fetchedAt: "2026-01-01T00:00:00Z", values: { drive_parry: 2, gauge_rate_ca: 0.1 } },
      { fetchedAt: "2026-01-01T00:00:00Z", values: { drive_parry: 4 } },
    ]);
    expect(average.drive_parry).toEqual({ value: 3, count: 2 });
    expect(average.gauge_rate_ca).toEqual({ value: 0.1, count: 1 });
    expect(average.just_parry).toBeUndefined();
  });
});
