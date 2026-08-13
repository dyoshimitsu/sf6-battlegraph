import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { mergeStoredMatches } from "./mergeStoredMatches";

function match(replayId: string, playedAtEpoch: number, fighterId = replayId): NormalizedMatch {
  const subject = { player: { short_id: 100, fighter_id: fighterId }, round_results: [1, 1] };
  const opponent = { player: { short_id: 200 }, round_results: [0, 0] };
  return { replayId, playedAtEpoch, subjectUserCode: 100, mode: "ranked", sourceTypes: ["all"], subjectSide: 1, result: "win", roundsWon: 2, roundsLost: 0, subject, opponent, raw: { replay_id: replayId, uploaded_at: playedAtEpoch, player1_info: subject, player2_info: opponent } };
}

describe("mergeStoredMatches", () => {
  it("retains archived matches and sorts the result newest first", () => {
    expect(mergeStoredMatches([match("old", 1)], [match("new", 2)]).map(item => item.replayId)).toEqual(["new", "old"]);
  });

  it("uses the newly imported replay while preserving all known source types", () => {
    const existing: NormalizedMatch = { ...match("same", 1, "old"), sourceTypes: ["ranked"] };
    const incoming = match("same", 1, "new");
    const [merged] = mergeStoredMatches([existing], [incoming]);
    expect(merged.subject.player.fighter_id).toBe("new");
    expect(merged.sourceTypes).toEqual(["ranked", "all"]);
  });
});
