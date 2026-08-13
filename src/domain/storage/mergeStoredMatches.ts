import type { NormalizedMatch } from "../buckler/types";

export interface StoredMergeSummary {
  newMatches: number;
  refreshedMatches: number;
  retainedMatches: number;
  totalMatches: number;
}

export function mergeStoredMatches(existing: NormalizedMatch[], incoming: NormalizedMatch[]): NormalizedMatch[] {
  const matches = new Map(existing.map(match => [match.replayId, match]));
  for (const match of incoming) {
    const previous = matches.get(match.replayId);
    matches.set(match.replayId, previous ? {
      ...match,
      sourceTypes: [...new Set([...previous.sourceTypes, ...match.sourceTypes])],
    } : match);
  }
  return [...matches.values()].sort((left, right) => right.playedAtEpoch - left.playedAtEpoch || left.replayId.localeCompare(right.replayId));
}

export function summarizeStoredMerge(existing: NormalizedMatch[], incoming: NormalizedMatch[]): StoredMergeSummary {
  const existingIds = new Set(existing.map(match => match.replayId));
  const incomingIds = new Set(incoming.map(match => match.replayId));
  let refreshedMatches = 0;
  for (const id of incomingIds) if (existingIds.has(id)) refreshedMatches += 1;
  return {
    newMatches: incomingIds.size - refreshedMatches,
    refreshedMatches,
    retainedMatches: [...existingIds].filter(id => !incomingIds.has(id)).length,
    totalMatches: new Set([...existingIds, ...incomingIds]).size,
  };
}
