import { describe, expect, it, vi } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { hydrateMatchSides } from "./hydrateMatchSides";

function match(replayId: string, subjectSide: 1 | 2 | null): NormalizedMatch {
  const subject = { player: { short_id: 100 } };
  const opponent = { player: { short_id: 200 } };
  return {
    replayId,
    subjectUserCode: 100,
    playedAtEpoch: 1,
    mode: "ranked",
    sourceTypes: ["all"],
    subjectSide,
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    subject,
    opponent,
    raw: { replay_id: replayId, uploaded_at: 1, player1_info: subject, player2_info: opponent },
  };
}

describe("hydrateMatchSides", () => {
  it("reads only missing sides and restores the raw player order", async () => {
    const getMatchSides = vi.fn(async () => new Map<string, 1 | 2>([["missing", 2]]));
    const result = await hydrateMatchSides({ getMatchSides }, 100, [
      match("known", 1),
      match("missing", null),
    ]);

    expect(getMatchSides).toHaveBeenCalledWith(100, ["missing"]);
    expect(result.hydratedCount).toBe(1);
    expect(result.matches[1].subjectSide).toBe(2);
    expect(result.matches[1].raw.player1_info.player.short_id).toBe(200);
    expect(result.matches[1].raw.player2_info.player.short_id).toBe(100);
  });

  it("does not read complete matches when every side is already known", async () => {
    const getMatchSides = vi.fn();
    const matches = [match("known", 1)];
    await expect(hydrateMatchSides({ getMatchSides }, 100, matches)).resolves.toEqual({
      matches,
      hydratedCount: 0,
    });
    expect(getMatchSides).not.toHaveBeenCalled();
  });

  it("leaves a match unknown when its complete document is unavailable", async () => {
    const result = await hydrateMatchSides({ getMatchSides: async () => new Map() }, 100, [
      match("missing", null),
    ]);
    expect(result).toMatchObject({ hydratedCount: 0, matches: [{ subjectSide: null }] });
  });
});
