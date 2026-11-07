import { describe, expect, it } from "vitest";
import type { MatchResult, NormalizedMatch } from "../buckler/types";
import {
  dailyRatingChanges,
  finishMethodBreakdown,
  frequentOpponents,
  opponentInputTypeRecords,
  sessionPositionRecords,
  streaks,
} from "./matchPatterns";

// 2026-01-01T12:00:00+09:00
const NOON = 1767236400;

function match(
  index: number,
  result: MatchResult,
  options: {
    at?: number;
    lp?: number;
    mr?: number;
    character?: number;
    opponent?: number;
    inputType?: number;
    rounds?: [number[], number[]];
    ranked?: boolean;
  } = {},
): NormalizedMatch {
  const [own, theirs] = options.rounds ?? [
    [1, 1],
    [0, 0],
  ];
  const subject = {
    player: { short_id: 1 },
    character_id: options.character ?? 21,
    character_tool_name: "jamie",
    league_point: options.lp,
    master_rating: options.mr,
    round_results: own,
  };
  const opponent = {
    player: {
      short_id: options.opponent ?? 100 + index,
      fighter_id: `Opponent${options.opponent ?? index}`,
    },
    character_tool_name: "ryu",
    battle_input_type: options.inputType,
    round_results: theirs,
  };
  return {
    replayId: `R${String(index).padStart(4, "0")}`,
    subjectUserCode: 1,
    playedAtEpoch: options.at ?? NOON + index * 300,
    battleType: options.ranked === false ? 2 : 1,
    mode: options.ranked === false ? "casual" : "ranked",
    sourceTypes: ["all"],
    subjectSide: 1,
    result,
    roundsWon: 2,
    roundsLost: 0,
    subject,
    opponent,
    raw: { replay_id: "", uploaded_at: 0, player1_info: subject, player2_info: opponent },
  };
}

describe("dailyRatingChanges", () => {
  it("sums changes from the previous ranked match of the same character", () => {
    const changes = dailyRatingChanges([
      match(0, "win", { lp: 1000, at: NOON - 86_400 }),
      match(1, "win", { lp: 1020 }),
      match(2, "loss", { lp: 1010 }),
      match(3, "win", { lp: 500, character: 1 }),
      match(4, "win", { lp: 2000, ranked: false }),
    ]);
    expect(changes.get("2026-01-01")).toEqual({ leaguePoint: 10 });
    expect(changes.has("2025-12-31")).toBe(false);
  });
});

describe("sessionPositionRecords", () => {
  it("restarts the count after a long break", () => {
    const games = [
      ...Array.from({ length: 12 }, (_, index) => match(index, index < 10 ? "win" : "loss")),
      match(20, "loss", { at: NOON + 12 * 300 + 3600 }),
    ];
    const buckets = sessionPositionRecords(games, 1800, 10, 3);
    expect(buckets.map((bucket) => [bucket.from, bucket.to, bucket.record.matches])).toEqual([
      [1, 10, 11],
      [11, 20, 2],
      [21, null, 0],
    ]);
    expect(buckets[1].record.losses).toBe(2);
  });
});

describe("finishMethodBreakdown", () => {
  it("counts won and lost rounds by finishing method", () => {
    const breakdown = finishMethodBreakdown([
      match(0, "win", {
        rounds: [
          [6, 0, 1],
          [0, 7, 0],
        ],
      }),
      match(1, "loss", {
        rounds: [
          [0, 0],
          [3, 3],
        ],
      }),
      match(2, "win", { rounds: [[9], [0]] }),
    ]);
    expect([...breakdown.won]).toEqual([
      [6, 1],
      [1, 1],
    ]);
    expect([...breakdown.lost]).toEqual([
      [7, 1],
      [3, 2],
    ]);
  });
});

describe("opponentInputTypeRecords", () => {
  it("groups by the opponent control type and keeps unknown types", () => {
    const records = opponentInputTypeRecords([
      match(0, "win", { inputType: 1 }),
      match(1, "loss", { inputType: 0 }),
      match(2, "win", { inputType: 1 }),
      match(3, "win"),
    ]);
    expect(records.map((item) => [item.inputType, item.record.wins, item.record.matches])).toEqual([
      [0, 0, 1],
      [1, 2, 2],
      [null, 1, 1],
    ]);
  });
});

describe("streaks", () => {
  it("tracks the current run and the longest runs, broken by draws", () => {
    expect(
      streaks([
        match(0, "win"),
        match(1, "win"),
        match(2, "win"),
        match(3, "draw"),
        match(4, "loss"),
        match(5, "loss"),
        match(6, "win"),
        match(7, "win"),
      ]),
    ).toEqual({ current: { result: "win", length: 2 }, longestWin: 3, longestLoss: 2 });
    expect(streaks([]).current).toBeNull();
  });
});

describe("frequentOpponents", () => {
  it("lists repeat opponents per character by match count", () => {
    const games = [
      match(0, "win", { opponent: 7 }),
      match(1, "loss", { opponent: 7 }),
      match(2, "win", { opponent: 7 }),
      match(3, "win", { opponent: 8 }),
      match(4, "win", { opponent: 8 }),
      match(5, "loss", { opponent: 8 }),
    ];
    games[5].opponent = { ...games[5].opponent, character_tool_name: "ken" };
    const opponents = frequentOpponents(games, 2);
    expect(
      opponents.map((item) => [
        item.userCode,
        item.characterSlug,
        item.record.matches,
        item.record.wins,
      ]),
    ).toEqual([
      [7, "ryu", 3, 2],
      [8, "ryu", 2, 2],
    ]);
    expect(opponents[0].fighterId).toBe("Opponent7");
  });
});
