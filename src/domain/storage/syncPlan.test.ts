import { describe, expect, it } from "vitest";
import type { BucklerBundlePreview, NormalizedMatch } from "../buckler/types";
import type { StoredManifest } from "./loadStoredMatches";
import { buildSyncPlan } from "./syncPlan";

function normalizedMatch(): NormalizedMatch {
  const subject = {
    player: { short_id: 100, fighter_id: "Subject", platform_name: "Steam" },
    character_id: 21,
    character_name: "ジェイミー",
    character_tool_name: "jamie",
    league_point: 19000,
    master_rating: 0,
    round_results: [1, 6],
  };
  const opponent = {
    player: { short_id: 200, fighter_id: "Opponent", platform_name: "CrossPlatform" },
    character_id: 1,
    character_name: "リュウ",
    character_tool_name: "ryu",
    league_point: 18500,
    master_rating: 0,
    round_results: [0, 0],
  };
  return {
    replayId: "REPLAY1",
    subjectUserCode: 100,
    playedAtEpoch: 1738368001,
    mode: "ranked",
    sourceTypes: ["all"],
    subjectSide: 1,
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    subject,
    opponent,
    raw: {
      replay_id: "REPLAY1",
      uploaded_at: 1738368001,
      player1_info: subject,
      player2_info: opponent,
    },
  };
}

function preview(): BucklerBundlePreview {
  const match = normalizedMatch();
  return {
    userCode: 100,
    buildId: "build",
    exportedAt: "2025-02-01T00:00:00Z",
    pageCount: 1,
    rawMatchCount: 1,
    uniqueMatchCount: 1,
    duplicateCount: 0,
    oldestPlayedAt: match.playedAtEpoch,
    newestPlayedAt: match.playedAtEpoch,
    matches: [match],
    sources: [{ sourceType: "all", pages: 1, expectedPages: 1, rawMatches: 1 }],
    warnings: [],
    isSinglePage: false,
  };
}

describe("buildSyncPlan", () => {
  it("preserves the first peak in both stored matches and complete match writes", () => {
    const peak = {
      actId: 13,
      fetchedAt: "2026-08-13T00:00:00Z",
      rating: 1591,
      characterId: 28,
      characterName: "舞",
      characterSlug: "mai",
    };
    const old = { ...normalizedMatch(), opponentPeak: peak };
    const incoming = preview();
    incoming.matches[0].opponentPeak = { ...peak, rating: 1700 };
    const plan = buildSyncPlan({}, incoming, "sync-peak", "generation-peak", "private", [old]);
    expect(plan.storedMatches[0].opponentPeak).toEqual(peak);
    expect(
      plan.writesBeforeManifest.find((write) => write.path.endsWith("/matches/REPLAY1"))?.data
        .opponentPeak,
    ).toEqual(peak);
  });
  it("plans raw, complete match, chunk, sync, and manifest writes", () => {
    const source = {
      format: "sf6-battlegraph.collector",
      version: 1,
      userCode: 100,
      buildId: "build",
      exportedAt: "2025-02-01T00:00:00Z",
      pages: [
        {
          sourceType: "all",
          sourcePath: "/battlelog",
          page: 1,
          fetchedAt: "2025-02-01T00:00:00Z",
          response: { pageProps: {} },
        },
      ],
    };
    const plan = buildSyncPlan(source, preview(), "sync-1", "generation-1");
    expect(plan.writesBeforeManifest.map((write) => write.path)).toEqual([
      "settings/deployment",
      "players/100",
      "players/100/snapshots/sync-1",
      "players/100/snapshots/sync-1/pages/all_001_0",
      "players/100/matches/REPLAY1",
      "players/100/queryChunks/generation-1_2025-02_001",
      "players/100/syncs/sync-1",
    ]);
    expect(plan.manifest.path).toBe("players/100/manifests/matches");
    expect(
      plan.writesBeforeManifest.find((write) => write.path === "players/100/snapshots/sync-1")?.data
        .status,
    ).toBe("prepared");
    expect(plan.completionWrites).toEqual([
      { path: "players/100/snapshots/sync-1", data: { status: "complete" } },
      {
        path: "players/100/syncs/sync-1",
        data: { status: "complete", activatedGeneration: "generation-1" },
      },
    ]);
    expect(plan.writeCount).toBe(10);
  });

  it("stores the ranking page and leader profiles as split raw pages", () => {
    const source = {
      format: "sf6-battlegraph.collector",
      version: 1,
      userCode: 100,
      buildId: "build",
      exportedAt: "2025-02-01T00:00:00Z",
      pages: [],
      rankingSnapshot: {
        characterSlug: "jamie",
        query: { character_id: "jamie" },
        fetchedAt: "2025-02-01T00:00:00Z",
        response: { pageProps: {} },
        topProfiles: [
          { userCode: 7, order: 1, fetchedAt: "2025-02-01T00:00:01Z", response: { a: 1 } },
        ],
      },
    };
    const plan = buildSyncPlan(source, preview(), "sync-r", "generation-r");
    const page = (id: string) =>
      plan.writesBeforeManifest.find(
        (write) => write.path === `players/100/snapshots/sync-r/pages/${id}`,
      )?.data;
    expect(page("ranking_master")).toMatchObject({
      sourceType: "ranking",
      characterSlug: "jamie",
      storage: "inline",
    });
    expect(plan.manifest.data.rankingLeaders).toEqual({
      syncId: "sync-r",
      characterSlug: "jamie",
      fetchedAt: "2025-02-01T00:00:00Z",
    });
    const previous = {
      activeGeneration: "generation-r",
      chunks: [],
      totalMatches: 1,
      rankingLeaders: plan.manifest.data.rankingLeaders as StoredManifest["rankingLeaders"],
    };
    expect(
      buildSyncPlan({}, preview(), "sync-next", "generation-next", "private", [], previous).manifest
        .data.rankingLeaders,
    ).toEqual(previous.rankingLeaders);
    expect(page("ranking_profile_001")).toMatchObject({
      sourceType: "ranking-profile",
      rankingUserCode: 7,
      rankingOrder: 1,
      storage: "parts",
    });
  });

  it("keeps the complete replay object in the match document", () => {
    const plan = buildSyncPlan({}, preview(), "sync-2", "generation-2");
    const complete = plan.writesBeforeManifest.find((write) =>
      write.path.endsWith("/matches/REPLAY1"),
    );
    expect(complete?.data.raw).toMatchObject({ replay_id: "REPLAY1" });
    expect(complete?.data).toMatchObject({
      opponentFighterId: "Opponent",
      playedDate: "2025-02-01",
      sourceSyncIds: ["sync-2"],
    });
  });

  it("uses a separate final manifest write for atomic generation activation", () => {
    const plan = buildSyncPlan({}, preview(), "sync-3", "generation-3");
    expect(plan.writesBeforeManifest.some((write) => write.path.includes("/manifests/"))).toBe(
      false,
    );
    expect(plan.manifest.data).toMatchObject({
      activeGeneration: "generation-3",
      sourceSyncId: "sync-3",
    });
    expect(plan.manifest.data.syncedAtEpoch).toEqual(expect.any(Number));
  });

  it("retains archived matches in the new query generation without rewriting their complete documents", () => {
    const archived = {
      ...normalizedMatch(),
      replayId: "ARCHIVED",
      playedAtEpoch: 1730000000,
      raw: { ...normalizedMatch().raw, replay_id: "ARCHIVED", uploaded_at: 1730000000 },
    };
    const plan = buildSyncPlan({}, preview(), "sync-archive", "generation-archive", "private", [
      archived,
    ]);
    const chunkMatches = plan.writesBeforeManifest
      .filter((write) => write.path.includes("/queryChunks/"))
      .flatMap((write) => (write.data.matches as Array<{ id: string }>).map((match) => match.id));
    expect(chunkMatches).toEqual(["ARCHIVED", "REPLAY1"]);
    expect(
      plan.writesBeforeManifest.some((write) => write.path.endsWith("/matches/ARCHIVED")),
    ).toBe(false);
    expect(plan.manifest.data.totalMatches).toBe(2);
  });

  it("keeps the active generation for rollback and schedules only older chunks for deletion", () => {
    const previous: StoredManifest = {
      activeGeneration: "current",
      chunks: [{ id: "current_2025-02_001", yearMonth: "2025-02", from: 1, to: 2, count: 2 }],
      previousGeneration: {
        generation: "previous",
        chunks: [{ id: "previous_2025-01_001", yearMonth: "2025-01", from: 1, to: 1, count: 1 }],
      },
      obsoleteChunkIds: ["orphan_2024-12_001"],
      totalMatches: 2,
    };
    const plan = buildSyncPlan({}, preview(), "sync-gc", "generation-gc", "private", [], previous);
    expect(plan.manifest.data).toMatchObject({
      previousGeneration: { generation: "current", chunks: previous.chunks },
      obsoleteChunkIds: ["orphan_2024-12_001", "previous_2025-01_001"],
    });
    expect(plan.deletesAfterManifest).toEqual([
      "players/100/queryChunks/orphan_2024-12_001",
      "players/100/queryChunks/previous_2025-01_001",
    ]);
    expect(plan.cleanupManifest?.data).toEqual({ obsoleteChunkIds: [] });
  });

  it("rejects an empty sync identifier", () => {
    expect(() => buildSyncPlan({}, preview(), "", "generation-4")).toThrow(/syncId/);
  });

  it("asks the adapter for played-at and first-seen timestamps", () => {
    const matchWrite = (plan: ReturnType<typeof buildSyncPlan>) =>
      plan.writesBeforeManifest.find((write) => write.path === "players/100/matches/REPLAY1");
    const first = matchWrite(
      buildSyncPlan(
        {},
        preview(),
        "sync-new",
        "generation-new",
        "private",
        [],
        undefined,
        new Set(),
      ),
    );
    expect(first?.timestampFields).toEqual({ playedAt: 1738368001 });
    expect(first?.serverTimestampFields).toEqual(["firstSeenAt"]);
    const again = matchWrite(
      buildSyncPlan(
        {},
        preview(),
        "sync-again",
        "generation-again",
        "private",
        [normalizedMatch()],
        undefined,
        new Set(["REPLAY1"]),
      ),
    );
    expect(again?.timestampFields).toEqual({ playedAt: 1738368001 });
    expect(again?.serverTimestampFields).toBeUndefined();
    expect(
      matchWrite(buildSyncPlan({}, preview(), "sync-unknown", "generation-unknown"))
        ?.serverTimestampFields,
    ).toBeUndefined();
  });
});
