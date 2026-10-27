import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "./aggregateMatches";
import { matchupPriorities } from "./matchupPriorities";

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
});
