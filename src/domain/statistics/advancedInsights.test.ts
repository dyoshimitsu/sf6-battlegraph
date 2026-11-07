import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { advancedInsights } from "./advancedInsights";
import { bestProfileHabits, parseProfileHabits } from "./profileHabits";

function match(id: string, time: number): NormalizedMatch {
  const subject = { player: { short_id: 1 }, master_rating: 1500, round_results: [1, 0, 1] };
  const opponent = { player: { short_id: 2 }, master_rating: 1560, round_results: [0, 1, 0] };
  return {
    replayId: id,
    subjectUserCode: 1,
    playedAtEpoch: time,
    mode: "ranked",
    sourceTypes: ["ranked"],
    subjectSide: 1,
    result: "win",
    roundsWon: 2,
    roundsLost: 1,
    subject,
    opponent,
    raw: { replay_id: id, uploaded_at: time, player1_info: subject, player2_info: opponent },
  };
}

describe("advanced insights", () => {
  it("groups Tokyo hours, rounds, rating differences, and estimated sessions", () => {
    const first = Date.parse("2026-08-12T15:00:00Z") / 1000;
    const result = advancedInsights([match("a", first), match("b", first + 60)]);
    // 00:00 on Thursday in Japan belongs to the Wednesday row, which runs until 05:59.
    expect(result.weekdays[3][0]).toMatchObject({ matches: 2, wins: 2, winRate: 100 });
    expect(result.weekdays[4][0]).toMatchObject({ matches: 0, winRate: null });
    expect(result.weekdays[3][1]).toMatchObject({ matches: 0, winRate: null });
    expect(result.rounds.won).toBe(4);
    expect(result.rounds.lost).toBe(2);
    expect(result.rounds.deciding).toHaveLength(2);
    expect(result.relative[2].wins).toBe(2);
    expect(result.rankedSets.map((item) => item.matches)).toEqual([1, 1]);
    expect(result.otherSets.map((item) => item.matches)).toEqual([0, 0, 0]);
  });

  it("counts ranked sets as at most two games regardless of the time between them", () => {
    const first = Date.parse("2026-08-12T15:00:00Z") / 1000;
    const casual = {
      ...match("d", first + 7200),
      mode: "casual" as const,
      battleType: 2,
      sourceTypes: ["all" as const],
    };
    const result = advancedInsights([
      match("a", first),
      match("b", first + 3600),
      match("c", first + 3700),
      casual,
      { ...casual, replayId: "e", playedAtEpoch: first + 7300 },
    ]);
    expect(result.rankedSets.map((item) => item.matches)).toEqual([2, 1]);
    expect(result.otherSets.map((item) => item.matches)).toEqual([1, 1, 0]);
  });
  it("validates profile ownership and preserves zero measurements", () => {
    const raw = {
      pageProps: {
        sid: 1,
        common: { statusCode: 200 },
        play: {
          battle_stats: {
            drive_parry: 0,
            drive_impact: 0.6,
            gauge_rate_drive_guard: 0.1144,
            gauge_rate_drive_other: 0.2829,
          },
        },
      },
    };
    expect(parseProfileHabits(raw, "2026-01-01T00:00:00Z", 1)?.values).toEqual({
      drive_impact: 0.6,
      drive_parry: 0,
      gauge_rate_drive_guard: 0.1144,
      gauge_rate_drive_other: 0.2829,
    });
    expect(parseProfileHabits(raw, "2026-01-01T00:00:00Z", 2)).toBeNull();
  });
  it("keeps draws and unknown results out of weekday/hour win rates", () => {
    const first = Date.parse("2026-08-12T15:00:00Z") / 1000;
    const result = advancedInsights([
      match("a", first),
      { ...match("b", first + 60), result: "draw" },
      { ...match("c", first + 120), result: "loss" },
    ]);
    expect(result.weekdays[3][0]).toMatchObject({
      matches: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      winRate: 50,
    });
  });
  it("compares only recorded 100-game windows available before each snapshot", () => {
    const games = Array.from({ length: 110 }, (_, index) => ({
      ...match(`r${index}`, index + 1),
      result: index < 50 ? ("loss" as const) : ("win" as const),
    }));
    const snapshots = [
      { fetchedAt: new Date(110_000).toISOString(), values: { gauge_rate_drive_guard: 0.2 } },
      { fetchedAt: new Date(100_000).toISOString(), values: { gauge_rate_drive_guard: 0.1 } },
      { fetchedAt: new Date(99_000).toISOString(), values: { gauge_rate_drive_guard: 0.3 } },
    ];
    const best = bestProfileHabits(snapshots, games);
    expect(best?.snapshot).toEqual(snapshots[0]);
    expect(best?.record).toMatchObject({ matches: 100, wins: 60, losses: 40, winRate: 60 });
    expect(bestProfileHabits(snapshots.slice(2), games)).toBeUndefined();
  });
});
