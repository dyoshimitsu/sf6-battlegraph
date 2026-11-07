import { parseCurrentRatings } from "../buckler/currentRatings";
import type {
  BucklerBundlePreview,
  BucklerCollectorBundle,
  BucklerPageResponse,
  NormalizedMatch,
} from "../buckler/types";
import { toTokyoDate } from "../statistics/aggregateMatches";
import type { StoredManifest } from "./loadStoredMatches";
import { mergeStoredMatches } from "./mergeStoredMatches";
import { buildQueryChunkGeneration, type QueryChunk } from "./queryChunks";
import { buildRawPageWrites } from "./rawPageWrites";

export const STORAGE_SCHEMA_VERSION = 1;
export const PARSER_VERSION = 1;

export interface PlannedWrite {
  path: string;
  data: Record<string, unknown>;
  /** Fields the storage adapter writes as timestamps, given in Unix seconds. */
  timestampFields?: Record<string, number>;
  /** Fields the storage adapter sets to the server commit time. */
  serverTimestampFields?: string[];
}

export interface SyncPlan {
  syncId: string;
  generation: string;
  userCode: number;
  writesBeforeManifest: PlannedWrite[];
  manifest: PlannedWrite;
  deletesAfterManifest: string[];
  cleanupManifest?: PlannedWrite;
  completionWrites: PlannedWrite[];
  writeCount: number;
  storedMatches: NormalizedMatch[];
}

interface RawPage {
  id: string;
  sourceType: string;
  sourcePath: string;
  page: number;
  fetchedAt?: string;
  response: unknown;
  opponentUserCode?: number;
  actId?: number;
  characterSlug?: string;
  rankingUserCode?: number;
  rankingOrder?: number;
}

export const RANKING_PROFILE_PAGE_COUNT = 3;

/** Raw page ID of the n-th (1-based) ranking leader profile in a snapshot. */
export function rankingProfilePageId(position: number): string {
  return `ranking_profile_${String(position).padStart(3, "0")}`;
}

function rawPages(source: unknown): RawPage[] {
  if (
    source &&
    typeof source === "object" &&
    (source as Partial<BucklerCollectorBundle>).format === "sf6-battlegraph.collector"
  ) {
    const bundle = source as BucklerCollectorBundle;
    const pages = (bundle.pages ?? []).map((item, index) => ({
      id: `${item.sourceType}_${String(item.page).padStart(3, "0")}_${index}`,
      sourceType: item.sourceType,
      sourcePath: item.sourcePath,
      page: item.page,
      fetchedAt: item.fetchedAt,
      response: item.response,
    }));
    const peaks = (bundle.opponentPeaks ?? []).map((item, index) => ({
      id: `opponent_peak_${String(index).padStart(3, "0")}`,
      sourceType: "opponent-peak",
      sourcePath: "/api/profile/play/act/highest/master_rating_info",
      page: index + 1,
      fetchedAt: item.fetchedAt,
      response: item.response,
      opponentUserCode: item.userCode,
      actId: item.actId,
    }));
    const profile = bundle.profileSnapshot;
    const ranking = bundle.rankingSnapshot;
    const rankingPages: RawPage[] = ranking
      ? [
          {
            id: "ranking_master",
            sourceType: "ranking",
            sourcePath: "/ranking/master",
            page: 1,
            fetchedAt: ranking.fetchedAt,
            response: ranking.response,
            characterSlug: ranking.characterSlug,
          },
          ...ranking.topProfiles.map((item, index) => ({
            id: rankingProfilePageId(index + 1),
            sourceType: "ranking-profile",
            sourcePath: "/play",
            page: index + 1,
            fetchedAt: item.fetchedAt,
            response: item.response,
            characterSlug: ranking.characterSlug,
            rankingUserCode: item.userCode,
            rankingOrder: item.order,
          })),
        ]
      : [];
    return [
      ...pages,
      ...peaks,
      ...rankingPages,
      ...(profile
        ? [
            {
              id: "profile_play",
              sourceType: "profile",
              sourcePath: "/play",
              page: 1,
              fetchedAt: profile.fetchedAt,
              response: profile.response,
            },
          ]
        : []),
    ];
  }
  const response = source as Partial<BucklerPageResponse>;
  return [
    {
      id: "all_001_0",
      sourceType: "all",
      sourcePath: "/battlelog",
      page: response?.pageProps?.current_page ?? 1,
      response: source,
    },
  ];
}

function playerInfo(preview: BucklerBundlePreview) {
  const latest = [...preview.matches].sort(
    (left, right) => right.playedAtEpoch - left.playedAtEpoch,
  )[0];
  return latest?.subject;
}

function completeMatch(match: NormalizedMatch, syncId: string): Record<string, unknown> {
  const subjectCharacterId =
    match.subject.playing_character_id ?? match.subject.character_id ?? null;
  const opponentCharacterId =
    match.opponent.playing_character_id ?? match.opponent.character_id ?? null;
  return {
    replayId: match.replayId,
    subjectUserCode: String(match.subjectUserCode),
    playedAtEpoch: match.playedAtEpoch,
    playedDate: toTokyoDate(match.playedAtEpoch),
    battleVersion: match.battleVersion,
    battleType: match.battleType,
    battleSubType: match.battleSubType,
    battleTypeName: match.battleTypeName,
    mode: match.mode,
    sourceTypes: match.sourceTypes,
    subjectSide: match.subjectSide,
    result: match.result,
    roundsWon: match.roundsWon,
    roundsLost: match.roundsLost,
    subjectCharacterId,
    subjectCharacterName: match.subject.playing_character_name ?? match.subject.character_name,
    subjectCharacterSlug:
      match.subject.playing_character_tool_name ?? match.subject.character_tool_name ?? "unknown",
    subjectInputType: match.subject.battle_input_type,
    subjectLeaguePoint: match.subject.league_point,
    subjectLeagueRank: match.subject.league_rank,
    subjectMasterRating: match.subject.master_rating,
    opponentUserCode: String(match.opponent.player.short_id),
    opponentFighterId: match.opponent.player.fighter_id,
    opponentPlatform: match.opponent.player.platform_name,
    opponentCharacterId,
    opponentCharacterName: match.opponent.playing_character_name ?? match.opponent.character_name,
    opponentCharacterSlug:
      match.opponent.playing_character_tool_name ?? match.opponent.character_tool_name ?? "unknown",
    opponentInputType: match.opponent.battle_input_type,
    opponentLeaguePoint: match.opponent.league_point,
    opponentLeagueRank: match.opponent.league_rank,
    opponentMasterRating: match.opponent.master_rating,
    opponentPeak: match.opponentPeak,
    raw: match.raw,
    sourceSyncIds: [syncId],
    schemaVersion: STORAGE_SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
  };
}

function chunkWrite(userCode: number, chunk: QueryChunk): PlannedWrite {
  return {
    path: `players/${userCode}/queryChunks/${chunk.id}`,
    data: chunk as unknown as Record<string, unknown>,
  };
}

export function buildSyncPlan(
  source: unknown,
  preview: BucklerBundlePreview,
  syncId: string,
  generation: string,
  visibility: "private" | "public" = "private",
  archivedMatches: NormalizedMatch[] = [],
  previousManifest?: StoredManifest,
  /**
   * Replay IDs that were already stored before this sync. When provided, matches outside
   * this set record their first-seen server time. Omit it when the stored set is unknown.
   */
  previouslyStoredReplayIds?: ReadonlySet<string>,
): SyncPlan {
  if (!syncId.trim()) throw new Error("syncId must not be empty");
  const userCode = preview.userCode;
  const bundle = source as Partial<BucklerCollectorBundle> | null;
  const currentRatings = bundle?.profileSnapshot
    ? parseCurrentRatings(bundle.profileSnapshot, userCode)
    : undefined;
  const pages = rawPages(source);
  const allMatches = mergeStoredMatches(archivedMatches, preview.matches);
  const chunks = buildQueryChunkGeneration(allMatches, generation);
  const latestPlayer = playerInfo(preview);
  const incomingReplayIds = new Set(preview.matches.map((match) => match.replayId));
  const base = `players/${userCode}`;
  const obsoleteChunkIds = [
    ...new Set([
      ...(previousManifest?.obsoleteChunkIds ?? []),
      ...(previousManifest?.previousGeneration?.chunks.map((chunk) => chunk.id) ?? []),
    ]),
  ].filter((id) => !chunks.descriptors.some((chunk) => chunk.id === id));

  const writesBeforeManifest: PlannedWrite[] = [
    { path: "settings/deployment", data: { visibility } },
    {
      path: base,
      data: {
        userCode: String(userCode),
        fighterId: latestPlayer?.player.fighter_id,
        platform: latestPlayer?.player.platform_name,
        latestLeaguePoint: latestPlayer?.league_point,
        latestMasterRating: latestPlayer?.master_rating,
        oldestPlayedAtEpoch: chunks.oldestPlayedAt,
        newestPlayedAtEpoch: chunks.newestPlayedAt,
        importedMatches: chunks.totalMatches,
        schemaVersion: STORAGE_SCHEMA_VERSION,
        parserVersion: PARSER_VERSION,
      },
    },
    {
      path: `${base}/snapshots/${syncId}`,
      data: {
        syncId,
        userCode: String(userCode),
        bucklerBuildId: preview.buildId,
        exportedAt: preview.exportedAt,
        sourceTypes: preview.sources.map((sourceSummary) => sourceSummary.sourceType),
        pageCount: preview.pageCount,
        matchCount: preview.rawMatchCount,
        schemaVersion: STORAGE_SCHEMA_VERSION,
        collectorVersion: 1,
        stopReason: preview.stopReason,
        stoppedAtKnownReplayId: preview.stoppedAtKnownReplayId,
        knownReplayBoundaryCount: preview.knownReplayBoundaryCount,
        status: "prepared",
      },
    },
    ...pages.flatMap((page) =>
      buildRawPageWrites({
        path: `${base}/snapshots/${syncId}/pages/${page.id}`,
        metadata: {
          sourceType: page.sourceType,
          sourcePath: page.sourcePath,
          page: page.page,
          fetchedAt: page.fetchedAt,
          opponentUserCode: page.opponentUserCode,
          actId: page.actId,
          characterSlug: page.characterSlug,
          rankingUserCode: page.rankingUserCode,
          rankingOrder: page.rankingOrder,
        },
        raw: page.response,
        forceParts: page.sourceType === "profile" || page.sourceType === "ranking-profile",
      }),
    ),
    ...allMatches
      .filter((match) => incomingReplayIds.has(match.replayId))
      .map(
        (match): PlannedWrite => ({
          path: `${base}/matches/${match.replayId}`,
          data: completeMatch(match, syncId),
          timestampFields: { playedAt: match.playedAtEpoch },
          ...(previouslyStoredReplayIds && !previouslyStoredReplayIds.has(match.replayId)
            ? { serverTimestampFields: ["firstSeenAt"] }
            : {}),
        }),
      ),
    ...chunks.chunks.map((chunk) => chunkWrite(userCode, chunk)),
    {
      path: `${base}/syncs/${syncId}`,
      data: {
        syncId,
        generation,
        status: "prepared",
        pageCount: preview.pageCount,
        rawMatchCount: preview.rawMatchCount,
        uniqueMatchCount: preview.uniqueMatchCount,
        totalStoredMatches: chunks.totalMatches,
        chunkCount: chunks.chunks.length,
        schemaVersion: STORAGE_SCHEMA_VERSION,
      },
    },
  ];
  const manifest: PlannedWrite = {
    path: `${base}/manifests/matches`,
    data: {
      activeGeneration: generation,
      chunks: chunks.descriptors,
      totalMatches: chunks.totalMatches,
      oldestPlayedAtEpoch: chunks.oldestPlayedAt,
      newestPlayedAtEpoch: chunks.newestPlayedAt,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      sourceSyncId: syncId,
      syncedAtEpoch: Math.floor(Date.now() / 1000),
      currentRatings: currentRatings ?? null,
      previousGeneration: previousManifest
        ? { generation: previousManifest.activeGeneration, chunks: previousManifest.chunks }
        : null,
      obsoleteChunkIds,
    },
  };
  const deletesAfterManifest = obsoleteChunkIds.map((id) => `${base}/queryChunks/${id}`);
  const cleanupManifest =
    deletesAfterManifest.length > 0
      ? { path: `${base}/manifests/matches`, data: { obsoleteChunkIds: [] } }
      : undefined;
  const completionWrites: PlannedWrite[] = [
    { path: `${base}/snapshots/${syncId}`, data: { status: "complete" } },
    {
      path: `${base}/syncs/${syncId}`,
      data: { status: "complete", activatedGeneration: generation },
    },
  ];
  return {
    syncId,
    generation,
    userCode,
    writesBeforeManifest,
    manifest,
    deletesAfterManifest,
    cleanupManifest,
    completionWrites,
    writeCount:
      writesBeforeManifest.length +
      1 +
      completionWrites.length +
      deletesAfterManifest.length +
      (cleanupManifest ? 1 : 0),
    storedMatches: allMatches,
  };
}
