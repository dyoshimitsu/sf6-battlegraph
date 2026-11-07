import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { advancedInsights } from "./advancedInsights";
import { parseProfileHabits } from "./profileHabits";

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
    expect(result.weekdays[4][0]).toMatchObject({ matches: 2, wins: 2, winRate: 100 });
    expect(result.weekdays[4][1]).toMatchObject({ matches: 0, winRate: null });
    expect(result.rounds.won).toBe(4);
    expect(result.rounds.lost).toBe(2);
    expect(result.rounds.deciding).toHaveLength(2);
    expect(result.relative[2].wins).toBe(2);
    expect(result.sessions.map((item) => item.matches)).toEqual([1, 1, 0]);
  });
  it("validates profile ownership and preserves zero measurements", () => {
    const raw = {
      pageProps: {
        sid: 1,
        common: { statusCode: 200 },
        play: { battle_stats: { drive_parry: 0, drive_impact: 0.6 } },
      },
    };
    expect(parseProfileHabits(raw, "2026-01-01T00:00:00Z", 1)?.values).toEqual({
      drive_impact: 0.6,
      drive_parry: 0,
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
    expect(result.weekdays[4][0]).toMatchObject({
      matches: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      winRate: 50,
    });
  });
});
