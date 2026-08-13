import { describe, expect, it } from "vitest";
import type { MatchResult, NormalizedMatch } from "../buckler/types";
import { aggregateMatches, filterMatches, toTokyoDate } from "./aggregateMatches";

function match(
  id: string,
  result: MatchResult,
  epoch: number,
  subjectCharacterId: number,
  opponentCharacterId: number,
  mode: NormalizedMatch["mode"] = "ranked",
): NormalizedMatch {
  const subject = {
    player: { short_id: 1000000001 },
    playing_character_id: subjectCharacterId,
    playing_character_name: subjectCharacterId === 21 ? "Jamie" : "Ryu",
    playing_character_tool_name: subjectCharacterId === 21 ? "jamie" : "ryu",
  };
  const opponent = {
    player: { short_id: 2000000002 },
    playing_character_id: opponentCharacterId,
    playing_character_name: opponentCharacterId === 1 ? "Ryu" : "Ken",
    playing_character_tool_name: opponentCharacterId === 1 ? "ryu" : "ken",
  };
  return {
    replayId: id,
    subjectUserCode: 1000000001,
    playedAtEpoch: epoch,
    mode,
    sourceTypes: [mode],
    subjectSide: 1,
    result,
    roundsWon: result === "win" ? 2 : 0,
    roundsLost: result === "loss" ? 2 : 0,
    subject,
    opponent,
    raw: {
      replay_id: id,
      uploaded_at: epoch,
      player1_info: subject,
      player2_info: opponent,
    },
  };
}

describe("Tokyo date handling", () => {
  it("uses Asia/Tokyo across the UTC date boundary", () => {
    expect(toTokyoDate(Date.parse("2026-08-12T14:59:59Z") / 1000)).toBe("2026-08-12");
    expect(toTokyoDate(Date.parse("2026-08-12T15:00:00Z") / 1000)).toBe("2026-08-13");
  });
});

describe("filterMatches", () => {
  const matches = [
    match("A", "win", Date.parse("2026-08-12T15:00:00Z") / 1000, 21, 1),
    match("B", "loss", Date.parse("2026-08-13T15:00:00Z") / 1000, 1, 2, "casual"),
  ];

  it("filters inclusive Tokyo calendar dates", () => {
    expect(filterMatches(matches, { fromDate: "2026-08-13", toDate: "2026-08-13" }))
      .toHaveLength(1);
  });

  it("combines mode and character filters", () => {
    expect(filterMatches(matches, { mode: "casual", subjectCharacterId: 1 }))
      .toEqual([matches[1]]);
  });
});

describe("aggregateMatches", () => {
  it("calculates decided-match win rate and character records", () => {
    const statistics = aggregateMatches([
      match("A", "win", 1_700_000_000, 21, 1),
      match("B", "loss", 1_699_999_000, 21, 2),
      match("C", "unknown", 1_699_998_000, 1, 1),
    ]);

    expect(statistics.overall).toEqual({
      matches: 3,
      wins: 1,
      losses: 1,
      draws: 0,
      unknown: 1,
      winRate: 50,
    });
    expect(statistics.bySubjectCharacter[0]).toMatchObject({
      characterId: 21,
      matches: 2,
      wins: 1,
      losses: 1,
    });
    expect(statistics.byOpponentCharacter[0]).toMatchObject({
      characterId: 1,
      matches: 2,
    });
  });
});
