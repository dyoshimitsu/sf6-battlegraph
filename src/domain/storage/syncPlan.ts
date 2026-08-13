import type { BucklerBundlePreview, BucklerCollectorBundle, BucklerPageResponse, NormalizedMatch } from "../buckler/types";
import { toTokyoDate } from "../statistics/aggregateMatches";
import { buildQueryChunkGeneration, type QueryChunk } from "./queryChunks";
import { mergeStoredMatches } from "./mergeStoredMatches";
import type { StoredManifest } from "./loadStoredMatches";
import { buildRawPageWrites } from "./rawPageWrites";

export const STORAGE_SCHEMA_VERSION = 1;
export const PARSER_VERSION = 1;

export interface PlannedWrite {
  path: string;
  data: Record<string, unknown>;
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
}

function rawPages(source: unknown): RawPage[] {
  if (source && typeof source === "object" && (source as Partial<BucklerCollectorBundle>).format === "sf6-battlegraph.collector") {
    return ((source as BucklerCollectorBundle).pages ?? []).map((item, index) => ({
      id: `${item.sourceType}_${String(item.page).padStart(3, "0")}_${index}`,
      sourceType: item.sourceType,
      sourcePath: item.sourcePath,
      page: item.page,
      fetchedAt: item.fetchedAt,
      response: item.response,
    }));
  }
  const response = source as Partial<BucklerPageResponse>;
  return [{
    id: "all_001_0",
    sourceType: "all",
    sourcePath: "/battlelog",
    page: response?.pageProps?.current_page ?? 1,
    response: source,
  }];
}

function playerInfo(preview: BucklerBundlePreview) {
  const latest = [...preview.matches].sort((left, right) => right.playedAtEpoch - left.playedAtEpoch)[0];
  return latest?.subject;
}

function completeMatch(match: NormalizedMatch, syncId: string): Record<string, unknown> {
  const subjectCharacterId = match.subject.playing_character_id ?? match.subject.character_id ?? null;
  const opponentCharacterId = match.opponent.playing_character_id ?? match.opponent.character_id ?? null;
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
    subjectCharacterSlug: match.subject.playing_character_tool_name ?? match.subject.character_tool_name ?? "unknown",
    subjectInputType: match.subject.battle_input_type,
    subjectLeaguePoint: match.subject.league_point,
    subjectLeagueRank: match.subject.league_rank,
    subjectMasterRating: match.subject.master_rating,
    opponentUserCode: String(match.opponent.player.short_id),
    opponentFighterId: match.opponent.player.fighter_id,
    opponentPlatform: match.opponent.player.platform_name,
    opponentCharacterId,
    opponentCharacterName: match.opponent.playing_character_name ?? match.opponent.character_name,
    opponentCharacterSlug: match.opponent.playing_character_tool_name ?? match.opponent.character_tool_name ?? "unknown",
    opponentInputType: match.opponent.battle_input_type,
    opponentLeaguePoint: match.opponent.league_point,
    opponentLeagueRank: match.opponent.league_rank,
    opponentMasterRating: match.opponent.master_rating,
    raw: match.raw,
    sourceSyncIds: [syncId],
    schemaVersion: STORAGE_SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
  };
}

function chunkWrite(userCode: number, chunk: QueryChunk): PlannedWrite {
  return { path: `players/${userCode}/queryChunks/${chunk.id}`, data: chunk as unknown as Record<string, unknown> };
}

export function buildSyncPlan(
  source: unknown,
  preview: BucklerBundlePreview,
  syncId: string,
  generation: string,
  visibility: "private" | "public" = "private",
  archivedMatches: NormalizedMatch[] = [],
  previousManifest?: StoredManifest,
): SyncPlan {
  if (!syncId.trim()) throw new Error("syncId must not be empty");
  const userCode = preview.userCode;
  const pages = rawPages(source);
  const allMatches = mergeStoredMatches(archivedMatches, preview.matches);
  const chunks = buildQueryChunkGeneration(allMatches, generation);
  const latestPlayer = playerInfo(preview);
  const base = `players/${userCode}`;
  const obsoleteChunkIds = [...new Set([
    ...(previousManifest?.obsoleteChunkIds ?? []),
    ...(previousManifest?.previousGeneration?.chunks.map(chunk => chunk.id) ?? []),
  ])].filter(id => !chunks.descriptors.some(chunk => chunk.id === id));

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
        sourceTypes: preview.sources.map(sourceSummary => sourceSummary.sourceType),
        pageCount: preview.pageCount,
        matchCount: preview.rawMatchCount,
        schemaVersion: STORAGE_SCHEMA_VERSION,
        collectorVersion: 1,
        status: "prepared",
      },
    },
    ...pages.flatMap(page => buildRawPageWrites({
      path: `${base}/snapshots/${syncId}/pages/${page.id}`,
      metadata: { sourceType: page.sourceType, sourcePath: page.sourcePath, page: page.page, fetchedAt: page.fetchedAt },
      raw: page.response,
    })),
    ...preview.matches.map(match => ({ path: `${base}/matches/${match.replayId}`, data: completeMatch(match, syncId) })),
    ...chunks.chunks.map(chunk => chunkWrite(userCode, chunk)),
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
      previousGeneration: previousManifest ? { generation: previousManifest.activeGeneration, chunks: previousManifest.chunks } : null,
      obsoleteChunkIds,
    },
  };
  const deletesAfterManifest = obsoleteChunkIds.map(id => `${base}/queryChunks/${id}`);
  const cleanupManifest = deletesAfterManifest.length > 0
    ? { path: `${base}/manifests/matches`, data: { obsoleteChunkIds: [] } }
    : undefined;
  const completionWrites: PlannedWrite[] = [
    { path: `${base}/snapshots/${syncId}`, data: { status: "complete" } },
    { path: `${base}/syncs/${syncId}`, data: { status: "complete", activatedGeneration: generation } },
  ];
  return {
    syncId, generation, userCode, writesBeforeManifest, manifest, deletesAfterManifest, cleanupManifest, completionWrites,
    writeCount: writesBeforeManifest.length + 1 + completionWrites.length + deletesAfterManifest.length + (cleanupManifest ? 1 : 0), storedMatches: allMatches,
  };
}
