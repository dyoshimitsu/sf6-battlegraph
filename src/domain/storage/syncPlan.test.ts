import { describe, expect, it } from "vitest";
import type { BucklerBundlePreview, NormalizedMatch } from "../buckler/types";
import { buildSyncPlan } from "./syncPlan";

function normalizedMatch(): NormalizedMatch {
  const subject = { player: { short_id: 100, fighter_id: "Subject", platform_name: "Steam" }, character_id: 21, character_name: "ジェイミー", character_tool_name: "jamie", league_point: 19000, master_rating: 0, round_results: [1, 6] };
  const opponent = { player: { short_id: 200, fighter_id: "Opponent", platform_name: "CrossPlatform" }, character_id: 1, character_name: "リュウ", character_tool_name: "ryu", league_point: 18500, master_rating: 0, round_results: [0, 0] };
  return { replayId: "REPLAY1", subjectUserCode: 100, playedAtEpoch: 1738368001, mode: "ranked", sourceTypes: ["all"], subjectSide: 1, result: "win", roundsWon: 2, roundsLost: 0, subject, opponent, raw: { replay_id: "REPLAY1", uploaded_at: 1738368001, player1_info: subject, player2_info: opponent } };
}

function preview(): BucklerBundlePreview {
  const match = normalizedMatch();
  return { userCode: 100, buildId: "build", exportedAt: "2025-02-01T00:00:00Z", pageCount: 1, rawMatchCount: 1, uniqueMatchCount: 1, duplicateCount: 0, oldestPlayedAt: match.playedAtEpoch, newestPlayedAt: match.playedAtEpoch, matches: [match], sources: [{ sourceType: "all", pages: 1, expectedPages: 1, rawMatches: 1 }], warnings: [], isSinglePage: false };
}

describe("buildSyncPlan", () => {
  it("plans raw, complete match, chunk, sync, and manifest writes", () => {
    const source = { format: "sf6-battlegraph.collector", version: 1, userCode: 100, buildId: "build", exportedAt: "2025-02-01T00:00:00Z", pages: [{ sourceType: "all", sourcePath: "/battlelog", page: 1, fetchedAt: "2025-02-01T00:00:00Z", response: { pageProps: {} } }] };
    const plan = buildSyncPlan(source, preview(), "sync-1", "generation-1");
    expect(plan.writesBeforeManifest.map(write => write.path)).toEqual([
      "settings/deployment",
      "players/100",
      "players/100/snapshots/sync-1",
      "players/100/snapshots/sync-1/pages/all_001_0",
      "players/100/matches/REPLAY1",
      "players/100/queryChunks/generation-1_2025-02_001",
      "players/100/syncs/sync-1",
    ]);
    expect(plan.manifest.path).toBe("players/100/manifests/matches");
    expect(plan.writeCount).toBe(8);
  });

  it("keeps the complete replay object in the match document", () => {
    const plan = buildSyncPlan({}, preview(), "sync-2", "generation-2");
    const complete = plan.writesBeforeManifest.find(write => write.path.endsWith("/matches/REPLAY1"));
    expect(complete?.data.raw).toMatchObject({ replay_id: "REPLAY1" });
    expect(complete?.data).toMatchObject({ opponentFighterId: "Opponent", playedDate: "2025-02-01", sourceSyncIds: ["sync-2"] });
  });

  it("uses a separate final manifest write for atomic generation activation", () => {
    const plan = buildSyncPlan({}, preview(), "sync-3", "generation-3");
    expect(plan.writesBeforeManifest.some(write => write.path.includes("/manifests/"))).toBe(false);
    expect(plan.manifest.data).toMatchObject({ activeGeneration: "generation-3", sourceSyncId: "sync-3" });
  });

  it("rejects an empty sync identifier", () => {
    expect(() => buildSyncPlan({}, preview(), "", "generation-4")).toThrow(/syncId/);
  });
});
