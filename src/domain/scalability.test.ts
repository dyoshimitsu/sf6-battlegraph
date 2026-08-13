import { describe, expect, it } from "vitest";
import type { BucklerPlayerInfo, NormalizedMatch } from "./buckler/types";
import { aggregateMatches, filterMatches } from "./statistics/aggregateMatches";
import { buildQueryChunkGeneration, DEFAULT_MAX_CHUNK_BYTES, DEFAULT_MAX_MATCHES_PER_CHUNK, serializedUtf8Bytes } from "./storage/queryChunks";

const MATCH_COUNT = 10_000;
const START_EPOCH = 1_735_689_600;

function player(shortId: number, characterId: number): BucklerPlayerInfo {
  return {
    player: { short_id: shortId, fighter_id: `fighter-${shortId}`, platform_name: "Steam" },
    character_id: characterId,
    character_name: `Character ${characterId}`,
    character_tool_name: `character-${characterId}`,
    battle_input_type: characterId % 2,
    league_point: 10_000 + characterId * 100,
    master_rating: characterId % 3 === 0 ? 1_500 + characterId : 0,
    round_results: [1, 6, 0],
  };
}

function matches(count = MATCH_COUNT): NormalizedMatch[] {
  return Array.from({ length: count }, (_, index) => {
    const subject = player(1134991793, index % 32 + 1);
    const opponent = player(2_000_000_000 + index, (index * 7) % 32 + 1);
    const result = index % 3 === 0 ? "loss" as const : "win" as const;
    return {
      replayId: `REPLAY${String(index).padStart(8, "0")}`,
      subjectUserCode: 1134991793,
      playedAtEpoch: START_EPOCH + index * 3_600,
      battleVersion: 20_004_000,
      battleType: index % 4 + 1,
      battleTypeName: "RANKED MATCH",
      mode: "ranked" as const,
      sourceTypes: ["all" as const, "ranked" as const],
      subjectSide: index % 2 === 0 ? 1 as const : 2 as const,
      result,
      roundsWon: result === "win" ? 2 : 1,
      roundsLost: result === "win" ? 1 : 2,
      subject,
      opponent,
      raw: { replay_id: `REPLAY${String(index).padStart(8, "0")}`, uploaded_at: START_EPOCH + index * 3_600, player1_info: subject, player2_info: opponent },
    };
  });
}

describe("all-time scalability", () => {
  it("aggregates and filters ten thousand matches within a browser-safe budget", () => {
    const history = matches();
    const started = performance.now();
    const statistics = aggregateMatches(history);
    const filtered = filterMatches(history, { mode: "ranked", subjectCharacterId: 1 });
    const elapsed = performance.now() - started;

    expect(statistics.overall.matches).toBe(MATCH_COUNT);
    expect(statistics.bySubjectCharacter).toHaveLength(32);
    expect(filtered).toHaveLength(313);
    expect(elapsed).toBeLessThan(2_000);
  });

  it("stores ten thousand matches in bounded Firestore query chunks", () => {
    const started = performance.now();
    const generation = buildQueryChunkGeneration(matches(), "scale-test");
    const elapsed = performance.now() - started;

    expect(generation.totalMatches).toBe(MATCH_COUNT);
    expect(generation.chunks.every(chunk => chunk.count <= DEFAULT_MAX_MATCHES_PER_CHUNK)).toBe(true);
    expect(generation.chunks.every(chunk => serializedUtf8Bytes(chunk) <= DEFAULT_MAX_CHUNK_BYTES)).toBe(true);
    expect(generation.chunks.length + 1).toBeLessThanOrEqual(50);
    expect(elapsed).toBeLessThan(2_000);
  });
});
