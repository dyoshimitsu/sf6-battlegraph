import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "./aggregateMatches";
import { completeOpponentRoster } from "./completeOpponentRoster";

function record(characterSlug: string, matches: number): CharacterRecord {
  return { characterId: 1, characterName: characterSlug, characterSlug, matches, wins: matches, losses: 0, draws: 0, unknown: 0, winRate: 100 };
}

describe("completeOpponentRoster", () => {
  it("shows the full roster with played characters first by match count", () => {
    const records = completeOpponentRoster([record("ryu", 2), record("luke", 5)], slug => slug.toUpperCase());
    expect(records.slice(0, 2).map(item => item.characterSlug)).toEqual(["luke", "ryu"]);
    expect(records).toHaveLength(32);
    expect(records.at(-1)).toMatchObject({ characterSlug: "random", matches: 0, winRate: null });
  });

  it("does not duplicate roster characters returned under a Buckler alias", () => {
    const records = completeOpponentRoster([record("gouki", 1)], slug => slug);
    expect(records.filter(item => ["gouki", "akuma"].includes(item.characterSlug))).toHaveLength(1);
  });

  it("places an observed future character before zero-match random", () => {
    const records = completeOpponentRoster([record("future", 0)], slug => slug);
    expect(records.slice(-2).map(item => item.characterSlug)).toEqual(["future", "random"]);
  });
});
