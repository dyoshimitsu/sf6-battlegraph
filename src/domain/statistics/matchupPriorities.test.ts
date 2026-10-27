import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import type { CharacterRecord } from "./aggregateMatches";
import { matchupPriorities, recentRankedMatchupPriorities } from "./matchupPriorities";

function record(characterSlug: string, wins: number, losses: number, unknown = 0): CharacterRecord {
  return {
    characterId: null,
    characterName: characterSlug,
    characterSlug,
    matches: wins + losses + unknown,
    wins,
    losses,
    draws: 0,
    unknown,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
  };
}

describe("matchupPriorities", () => {
  it("ranks frequent losing matchups by their win-loss deficit and limits results to three", () => {
    const results = matchupPriorities([
      record("ryu", 7, 13),
      record("ken", 2, 8),
      record("jamie", 1, 12),
      record("luke", 5, 6),
      record("guile", 9, 2),
      record("juri", 0, 9, 20),
    ]);
    expect(results.map((item) => item.characterSlug)).toEqual(["jamie", "ryu", "ken"]);
  });

  it("returns no priorities when results are insufficient or at least even", () => {
    expect(matchupPriorities([record("ken", 0, 0), record("ryu", 5, 5)])).toEqual([]);
  });

  it("uses only the latest 100 ranked games, regardless of input order", () => {
    const subject = { player: { short_id: 1 } };
    const makeMatch = (index: number, mode: "ranked" | "casual"): NormalizedMatch => {
      const opponent = {
        player: { short_id: 2 },
        character_id: index < 10 ? 1 : 2,
        character_tool_name: index < 10 ? "ryu" : "ken",
      };
      return {
        replayId: `r${index}`,
        subjectUserCode: 1,
        playedAtEpoch: index,
        mode,
        sourceTypes: [mode],
        subjectSide: 1,
        result: "loss",
        roundsWon: 0,
        roundsLost: 2,
        subject,
        opponent,
        raw: {
          replay_id: `r${index}`,
          uploaded_at: index,
          player1_info: subject,
          player2_info: opponent,
        },
      };
    };
    const games = Array.from({ length: 110 }, (_, index) => makeMatch(index, "ranked"));
    games.push(makeMatch(200, "casual"));
    const priorities = recentRankedMatchupPriorities(games);
    expect(priorities.map((item) => [item.characterSlug, item.matches])).toEqual([["ken", 100]]);
  });
});
