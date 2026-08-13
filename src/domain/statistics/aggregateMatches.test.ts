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
  subjectSide: NormalizedMatch["subjectSide"] = 1,
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
    subjectSide,
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
    expect(filterMatches(matches, { fromDate: "2026-08-13", toDate: "2026-08-13" })).toHaveLength(
      1,
    );
  });

  it("combines mode and character filters", () => {
    expect(filterMatches(matches, { mode: "casual", subjectCharacterId: 1 })).toEqual([matches[1]]);
  });

  it("filters by derived Act and exact battle version", () => {
    const act12 = match("act12", "win", Date.parse("2026-07-31T03:00:00Z") / 1000, 21, 1);
    const act13 = {
      ...match("act13", "loss", Date.parse("2026-08-01T03:00:00Z") / 1000, 21, 1),
      battleVersion: 20_004_000,
    };
    const previousVersion = { ...act12, battleVersion: 20_003_000 };

    expect(filterMatches([previousVersion, act13], { actId: 13 })).toEqual([act13]);
    expect(filterMatches([previousVersion, act13], { battleVersion: 20_003_000 })).toEqual([
      previousVersion,
    ]);
  });

  it("filters by the inferred mode when the acquisition source was all", () => {
    const casual = { ...matches[1], mode: "casual" as const, sourceTypes: ["all" as const] };
    expect(filterMatches([matches[0], casual], { mode: "casual" })).toEqual([casual]);
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
    expect(statistics.byDay).toEqual([
      { date: "2023-11-15", matches: 3, wins: 1, losses: 1, draws: 0, unknown: 1, winRate: 50 },
    ]);
  });

  it("groups daily records by the Tokyo calendar date in chronological order", () => {
    const statistics = aggregateMatches([
      match("B", "loss", Date.parse("2026-08-13T15:00:00Z") / 1000, 21, 1),
      match("A", "win", Date.parse("2026-08-12T15:00:00Z") / 1000, 21, 1),
    ]);
    expect(statistics.byDay.map((day) => [day.date, day.matches, day.winRate])).toEqual([
      ["2026-08-13", 1, 100],
      ["2026-08-14", 1, 0],
    ]);
  });

  it("calculates win rates independently for the 1P and 2P sides", () => {
    const statistics = aggregateMatches([
      match("1p-win", "win", 3, 21, 1, "ranked", 1),
      match("1p-loss", "loss", 2, 21, 1, "ranked", 1),
      match("2p-win", "win", 1, 21, 1, "ranked", 2),
      match("legacy", "win", 0, 21, 1, "ranked", null),
    ]);

    expect(statistics.bySide).toEqual([
      { side: 1, matches: 2, wins: 1, losses: 1, draws: 0, unknown: 0, winRate: 50 },
      { side: 2, matches: 1, wins: 1, losses: 0, draws: 0, unknown: 0, winRate: 100 },
    ]);
  });
});
