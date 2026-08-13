import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "../buckler/types";
import { buildQueryChunkGeneration, serializedUtf8Bytes } from "./queryChunks";

function match(id: string, at: number): NormalizedMatch {
  const player = (shortId: number) => ({
    player: { short_id: shortId, fighter_id: `Player ${shortId}`, platform_name: "Steam" },
    character_id: 21,
    character_name: "ジェイミー",
    character_tool_name: "jamie",
    battle_input_type: 0,
    league_point: 19000,
    master_rating: 0,
    round_results: [1, 6],
  });
  return {
    replayId: id,
    subjectUserCode: 100,
    playedAtEpoch: at,
    mode: "ranked",
    sourceTypes: ["all"],
    subjectSide: 1,
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    subject: player(100),
    opponent: { ...player(200), round_results: [0, 0] },
    raw: { replay_id: id, uploaded_at: at, player1_info: player(100), player2_info: player(200) },
  };
}

describe("buildQueryChunkGeneration", () => {
  it("groups by Tokyo year-month and sorts matches chronologically", () => {
    const result = buildQueryChunkGeneration([
      match("feb", 1738335600),
      match("jan", 1738335599),
    ], "gen-1");
    expect(result.chunks.map(chunk => chunk.yearMonth)).toEqual(["2025-01", "2025-02"]);
    expect(result.descriptors.map(chunk => chunk.id)).toEqual([
      "gen-1_2025-01_001",
      "gen-1_2025-02_001",
    ]);
  });

  it("splits a month at the configured match limit", () => {
    const result = buildQueryChunkGeneration([
      match("3", 1738368003), match("1", 1738368001), match("2", 1738368002),
    ], "gen-2", { maxMatches: 2 });
    expect(result.chunks.map(chunk => chunk.matches.map(item => item.id))).toEqual([["1", "2"], ["3"]]);
    expect(result.chunks.map(chunk => chunk.count)).toEqual([2, 1]);
  });

  it("measures UTF-8 bytes and splits before the byte limit", () => {
    const one = buildQueryChunkGeneration([match("one", 1738368001)], "gen-3").chunks[0];
    const two = buildQueryChunkGeneration([match("one", 1738368001), match("two", 1738368002)], "gen-3").chunks[0];
    const limit = Math.floor((serializedUtf8Bytes(one) + serializedUtf8Bytes(two)) / 2);
    const result = buildQueryChunkGeneration([match("one", 1738368001), match("two", 1738368002)], "gen-3", { maxBytes: limit });
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.every(chunk => serializedUtf8Bytes(chunk) <= limit)).toBe(true);
  });

  it("retains fields needed by the current client views", () => {
    const queryMatch = buildQueryChunkGeneration([match("one", 1738368001)], "gen-4").chunks[0].matches[0];
    expect(queryMatch).toMatchObject({
      id: "one",
      result: "win",
      subject: { characterSlug: "jamie", leaguePoint: 19000, roundResults: [1, 6] },
      opponent: { userCode: 200, fighterId: "Player 200", platform: "Steam" },
    });
  });
});
