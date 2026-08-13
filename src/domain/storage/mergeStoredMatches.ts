import type { NormalizedMatch } from "../buckler/types";

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
