import { inferBattleMode } from "../buckler/battleModes";
import type { BucklerPlayerInfo, BucklerReplay, NormalizedMatch } from "../buckler/types";
import type { QueryChunk, QueryChunkDescriptor, QueryMatch, QueryPlayer } from "./queryChunks";

export interface StoredManifest {
  activeGeneration: string;
  chunks: QueryChunkDescriptor[];
  totalMatches: number;
  oldestPlayedAtEpoch?: number;
  newestPlayedAtEpoch?: number;
  previousGeneration?: { generation: string; chunks: QueryChunkDescriptor[] } | null;
  obsoleteChunkIds?: string[];
  sourceSyncId?: string;
  syncedAtEpoch?: number;
}

export interface StoredMatchReadPort {
  getManifest(userCode: number): Promise<StoredManifest | null>;
  getChunks(userCode: number, ids: string[]): Promise<QueryChunk[]>;
}

export interface StoredMatches {
  manifest: StoredManifest;
  matches: NormalizedMatch[];
  reads: number;
}

function toPlayer(player: QueryPlayer): BucklerPlayerInfo {
  return {
    player: {
      short_id: player.userCode,
      fighter_id: player.fighterId,
      platform_name: player.platform,
    },
    character_id: player.characterId ?? undefined,
    character_name: player.characterName,
    character_tool_name: player.characterSlug,
    playing_character_id: player.characterId ?? undefined,
    playing_character_name: player.characterName,
    playing_character_tool_name: player.characterSlug,
    battle_input_type: player.inputType,
    league_point: player.leaguePoint,
    league_rank: player.leagueRank,
    master_rating: player.masterRating,
    round_results: [...player.roundResults],
  };
}

export function queryMatchToNormalized(match: QueryMatch): NormalizedMatch {
  const subject = toPlayer(match.subject),
    opponent = toPlayer(match.opponent);
  const subjectSide = match.subjectSide ?? null;
  const raw: BucklerReplay = {
    replay_id: match.id,
    uploaded_at: match.at,
    battle_version: match.version,
    replay_battle_type: match.battleType,
    replay_battle_sub_type: match.battleSubType,
    replay_battle_type_name: match.battleTypeName,
    player1_info: subjectSide === 2 ? opponent : subject,
    player2_info: subjectSide === 2 ? subject : opponent,
  };
  return {
    replayId: match.id,
    subjectUserCode: match.subject.userCode,
    playedAtEpoch: match.at,
    battleVersion: match.version,
    battleType: match.battleType,
    battleSubType: match.battleSubType,
    battleTypeName: match.battleTypeName,
    mode: inferBattleMode(raw, match.mode),
    sourceTypes: [...match.sourceTypes],
    subjectSide,
    result: match.result,
    roundsWon: match.roundsWon,
    roundsLost: match.roundsLost,
    subject,
    opponent,
    raw,
  };
}

export async function loadStoredMatches(
  port: StoredMatchReadPort,
  userCode: number,
): Promise<StoredMatches | null> {
  const manifest = await port.getManifest(userCode);
  if (!manifest) return null;
  const chunks = await port.getChunks(
    userCode,
    manifest.chunks.map((chunk) => chunk.id),
  );
  const expected = new Set(manifest.chunks.map((chunk) => chunk.id));
  if (
    chunks.some(
      (chunk) => chunk.generation !== manifest.activeGeneration || !expected.has(chunk.id),
    )
  )
    throw new Error("Stored query chunk does not belong to the active manifest");
  if (chunks.length !== expected.size)
    throw new Error("Stored query chunk generation is incomplete");
  const matches = chunks
    .flatMap((chunk) => chunk.matches)
    .map(queryMatchToNormalized)
    .sort(
      (left, right) =>
        right.playedAtEpoch - left.playedAtEpoch || left.replayId.localeCompare(right.replayId),
    );
  const unique = new Map(matches.map((match) => [match.replayId, match]));
  if (unique.size !== manifest.totalMatches)
    throw new Error("Stored match count does not match the active manifest");
  return { manifest, matches: [...unique.values()], reads: 1 + chunks.length };
}
