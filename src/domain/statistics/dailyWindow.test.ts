import { describe, expect, it } from "vitest";
import { buildDailyWindow } from "./dailyWindow";

describe("buildDailyWindow", () => {
  it("returns fourteen calendar days ending on the latest record", () => {
    const result = buildDailyWindow([
      { date: "2026-08-01", matches: 1, wins: 1, losses: 0, draws: 0, unknown: 0, winRate: 100 },
      { date: "2026-08-14", matches: 2, wins: 1, losses: 1, draws: 0, unknown: 0, winRate: 50 },
    ]);
    expect(result).toHaveLength(14);
    expect(result[0].date).toBe("2026-08-01");
    expect(result[1]).toMatchObject({ date: "2026-08-02", matches: 0, winRate: null });
    expect(result.at(-1)).toMatchObject({ date: "2026-08-14", matches: 2 });
  });

  it("returns no placeholders without a latest record", () => {
    expect(buildDailyWindow([])).toEqual([]);
  });
});
