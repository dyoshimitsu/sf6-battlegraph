import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { isRankedMatch, latestRatingCharacterKey, ratingMatches } from "./ratingMatches";

function match(overrides: Partial<NormalizedMatch>): NormalizedMatch {
  const player = { player: { short_id: 1 }, league_point: 19_000, master_rating: 1_500 };
  return {
    replayId: "REPLAY",
    subjectUserCode: 1,
    playedAtEpoch: 1,
    mode: "all",
    sourceTypes: ["all"],
    subjectSide: 1,
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    subject: player,
    opponent: { player: { short_id: 2 } },
    raw: { replay_id: "REPLAY", uploaded_at: 1, player1_info: player, player2_info: { player: { short_id: 2 } } },
    ...overrides,
  };
}

describe("ratingMatches", () => {
  it("recognizes ranked matches collected from the combined battle log", () => {
    expect(isRankedMatch(match({ battleType: 1, battleTypeName: "RANKED MATCH" }))).toBe(true);
  });

  it("keeps compatibility with stored mode-specific records", () => {
    expect(isRankedMatch(match({ mode: "ranked", sourceTypes: ["ranked"] }))).toBe(true);
  });

  it("excludes non-ranked modes even when they contain LP and MR", () => {
    const ranked = match({ replayId: "RANKED", battleType: 1 });
    const casual = match({ replayId: "CASUAL", battleType: 2, battleTypeName: "CASUAL MATCH" });
    const hub = match({ replayId: "HUB", battleType: 4, battleTypeName: "BATTLE HUB" });
    expect(ratingMatches([ranked, casual, hub]).map(item => item.replayId)).toEqual(["RANKED"]);
  });

  it("selects the character used in the latest ranked match", () => {
    const older = match({ playedAtEpoch: 100, battleType: 1, subject: { player: { short_id: 1 }, character_id: 21 } });
    const latest = match({ playedAtEpoch: 300, battleType: 1, subject: { player: { short_id: 1 }, character_id: 2 } });
    const newerCasual = match({ playedAtEpoch: 400, battleType: 2, battleTypeName: "CASUAL MATCH", subject: { player: { short_id: 1 }, character_id: 3 } });
    expect(latestRatingCharacterKey([older, newerCasual, latest])).toBe("id:2");
  });
});
