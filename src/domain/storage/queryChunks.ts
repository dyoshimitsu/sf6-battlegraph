import type { BucklerPlayerInfo, BucklerSourceType, MatchResult, NormalizedMatch } from "../buckler/types";
import { toTokyoDate } from "../statistics/aggregateMatches";

export const DEFAULT_MAX_MATCHES_PER_CHUNK = 250;
export const DEFAULT_MAX_CHUNK_BYTES = 700 * 1024;
export const QUERY_CHUNK_SCHEMA_VERSION = 1;

export interface QueryPlayer {
  userCode: number;
  fighterId?: string;
  platform?: string;
  characterId: number | null;
  characterName?: string;
  characterSlug: string;
  inputType?: number;
  leaguePoint?: number;
  leagueRank?: number;
  masterRating?: number;
  roundResults: number[];
}

export interface QueryMatch {
  id: string;
  at: number;
  version?: number;
  battleType?: number;
  battleSubType?: number;
  battleTypeName?: string;
  mode: BucklerSourceType;
  sourceTypes: BucklerSourceType[];
  result: MatchResult;
  roundsWon: number;
  roundsLost: number;
  subject: QueryPlayer;
  opponent: QueryPlayer;
}

export interface QueryChunk {
  id: string;
  generation: string;
  yearMonth: string;
  sequence: number;
  from: number;
  to: number;
  count: number;
  matches: QueryMatch[];
  schemaVersion: number;
}

export interface QueryChunkDescriptor {
  id: string;
  yearMonth: string;
  from: number;
  to: number;
  count: number;
}

export interface QueryChunkGeneration {
  generation: string;
  chunks: QueryChunk[];
  descriptors: QueryChunkDescriptor[];
  totalMatches: number;
  oldestPlayedAt?: number;
  newestPlayedAt?: number;
}

export interface QueryChunkOptions {
  maxMatches?: number;
  maxBytes?: number;
}

function playerToQuery(player: BucklerPlayerInfo): QueryPlayer {
  return {
    userCode: player.player.short_id,
    fighterId: player.player.fighter_id,
    platform: player.player.platform_name,
    characterId: player.playing_character_id ?? player.character_id ?? null,
    characterName: player.playing_character_name ?? player.character_name,
    characterSlug: player.playing_character_tool_name ?? player.character_tool_name ?? "unknown",
    inputType: player.battle_input_type,
    leaguePoint: player.league_point,
    leagueRank: player.league_rank,
    masterRating: player.master_rating,
    roundResults: [...(player.round_results ?? [])],
  };
}

export function toQueryMatch(match: NormalizedMatch): QueryMatch {
  return {
    id: match.replayId,
    at: match.playedAtEpoch,
    version: match.battleVersion,
    battleType: match.battleType,
    battleSubType: match.battleSubType,
    battleTypeName: match.battleTypeName,
    mode: match.mode,
    sourceTypes: [...match.sourceTypes],
    result: match.result,
    roundsWon: match.roundsWon,
    roundsLost: match.roundsLost,
    subject: playerToQuery(match.subject),
    opponent: playerToQuery(match.opponent),
  };
}

export function serializedUtf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function createChunk(generation: string, yearMonth: string, sequence: number, matches: QueryMatch[]): QueryChunk {
  return {
    id: `${generation}_${yearMonth}_${String(sequence).padStart(3, "0")}`,
    generation,
    yearMonth,
    sequence,
    from: matches[0].at,
    to: matches.at(-1)?.at ?? matches[0].at,
    count: matches.length,
    matches,
    schemaVersion: QUERY_CHUNK_SCHEMA_VERSION,
  };
}

function estimatedChunkBytes(generation: string, yearMonth: string, sequence: number, first: QueryMatch, last: QueryMatch, count: number, matchBytes: number): number {
  const shell: QueryChunk = {
    id: `${generation}_${yearMonth}_${String(sequence).padStart(3, "0")}`,
    generation,
    yearMonth,
    sequence,
    from: first.at,
    to: last.at,
    count,
    matches: [],
    schemaVersion: QUERY_CHUNK_SCHEMA_VERSION,
  };
  return serializedUtf8Bytes(shell) - 2 + matchBytes + Math.max(0, count - 1);
}

export function buildQueryChunkGeneration(
  matches: NormalizedMatch[],
  generation: string,
  options: QueryChunkOptions = {},
): QueryChunkGeneration {
  if (!generation.trim()) throw new Error("generation must not be empty");
  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES_PER_CHUNK;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  if (maxMatches < 1 || maxBytes < 1) throw new Error("chunk limits must be positive");

  const grouped = new Map<string, QueryMatch[]>();
  for (const match of [...matches].sort((left, right) => left.playedAtEpoch - right.playedAtEpoch || left.replayId.localeCompare(right.replayId))) {
    const yearMonth = toTokyoDate(match.playedAtEpoch).slice(0, 7);
    grouped.set(yearMonth, [...(grouped.get(yearMonth) ?? []), toQueryMatch(match)]);
  }

  const chunks: QueryChunk[] = [];
  for (const [yearMonth, monthMatches] of grouped) {
    let sequence = 1;
    let pending: QueryMatch[] = [];
    let pendingMatchBytes = 0;
    for (const match of monthMatches) {
      const matchBytes = serializedUtf8Bytes(match);
      const candidateCount = pending.length + 1;
      const candidateBytes = estimatedChunkBytes(generation, yearMonth, sequence, pending[0] ?? match, match, candidateCount, pendingMatchBytes + matchBytes);
      if (pending.length > 0 && (candidateCount > maxMatches || candidateBytes > maxBytes)) {
        chunks.push(createChunk(generation, yearMonth, sequence, pending));
        sequence += 1;
        pending = [match];
        pendingMatchBytes = matchBytes;
      } else {
        pending.push(match);
        pendingMatchBytes += matchBytes;
      }
      if (estimatedChunkBytes(generation, yearMonth, sequence, pending[0], match, pending.length, pendingMatchBytes) > maxBytes) {
        throw new Error(`match ${match.id} exceeds the query chunk byte limit`);
      }
    }
    if (pending.length > 0) chunks.push(createChunk(generation, yearMonth, sequence, pending));
  }

  const descriptors = chunks.map(({ id, yearMonth, from, to, count }) => ({ id, yearMonth, from, to, count }));
  return {
    generation,
    chunks,
    descriptors,
    totalMatches: matches.length,
    oldestPlayedAt: chunks[0]?.from,
    newestPlayedAt: chunks.at(-1)?.to,
  };
}
