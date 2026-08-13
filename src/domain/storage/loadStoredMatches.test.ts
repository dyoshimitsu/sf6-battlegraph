import { describe, expect, it } from "vitest";
import {
  loadStoredMatches,
  type StoredManifest,
  type StoredMatchReadPort,
} from "./loadStoredMatches";
import type { QueryChunk, QueryMatch } from "./queryChunks";

function queryMatch(id: string, at: number): QueryMatch {
  const player = (userCode: number) => ({
    userCode,
    fighterId: `P${userCode}`,
    platform: "Steam",
    characterId: 21,
    characterName: "ジェイミー",
    characterSlug: "jamie",
    leaguePoint: 19000,
    masterRating: 0,
    roundResults: [1, 6],
  });
  return {
    id,
    at,
    mode: "ranked",
    sourceTypes: ["all"],
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    subject: player(100),
    opponent: { ...player(200), roundResults: [0, 0] },
  };
}

function fixture() {
  const manifest: StoredManifest = {
    activeGeneration: "gen",
    chunks: [
      { id: "gen_2025-01_001", yearMonth: "2025-01", from: 2, to: 2, count: 1 },
      { id: "gen_2025-02_001", yearMonth: "2025-02", from: 3, to: 3, count: 1 },
    ],
    totalMatches: 2,
  };
  const chunks: QueryChunk[] = manifest.chunks.map((item, index) => ({
    ...item,
    generation: "gen",
    sequence: 1,
    matches: [queryMatch(index ? "new" : "old", item.from)],
    schemaVersion: 1,
  }));
  const port: StoredMatchReadPort = {
    getManifest: async () => manifest,
    getChunks: async () => [...chunks].reverse(),
  };
  return { manifest, chunks, port };
}

describe("loadStoredMatches", () => {
  it("returns null without an active manifest", async () => {
    expect(
      await loadStoredMatches({ getManifest: async () => null, getChunks: async () => [] }, 100),
    ).toBeNull();
  });

  it("loads only manifest chunks and restores newest-first normalized matches", async () => {
    const result = await loadStoredMatches(fixture().port, 100);
    expect(result?.matches.map((match) => match.replayId)).toEqual(["new", "old"]);
    expect(result?.matches[0].subject.player.fighter_id).toBe("P100");
    expect(result?.reads).toBe(3);
    expect(result?.matches[0].subjectSide).toBeNull();
  });

  it("restores the subject side from current query chunks", async () => {
    const { port, chunks } = fixture();
    chunks[1].matches[0].subjectSide = 2;
    const result = await loadStoredMatches(port, 100);
    expect(result?.matches[0].subjectSide).toBe(2);
    expect(result?.matches[0].raw.player2_info.player.short_id).toBe(100);
  });

  it("repairs legacy all-mode query matches from their battle metadata", async () => {
    const { manifest, chunks } = fixture();
    chunks[0].matches[0] = {
      ...chunks[0].matches[0],
      mode: "all",
      battleType: 4,
      battleTypeName: "BATTLE HUB",
    };
    const port: StoredMatchReadPort = {
      getManifest: async () => manifest,
      getChunks: async () => chunks,
    };
    const result = await loadStoredMatches(port, 100);
    expect(result?.matches.find((match) => match.replayId === "old")?.mode).toBe("hub");
  });

  it("rejects an incomplete generation", async () => {
    const { manifest } = fixture();
    await expect(
      loadStoredMatches({ getManifest: async () => manifest, getChunks: async () => [] }, 100),
    ).rejects.toThrow(/incomplete/);
  });

  it("rejects chunks from another generation", async () => {
    const { manifest, chunks } = fixture();
    chunks[0].generation = "stale";
    await expect(
      loadStoredMatches({ getManifest: async () => manifest, getChunks: async () => chunks }, 100),
    ).rejects.toThrow(/active manifest/);
  });
});
