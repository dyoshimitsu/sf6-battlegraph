import { compareCharacterSlugs } from "../buckler/characterOrder";
import type { NormalizedMatch } from "../buckler/types";
import type { CharacterRecord } from "./aggregateMatches";
import { aggregateMatches } from "./aggregateMatches";
import { ratingMatches } from "./ratingMatches";

export function recentRankedMatchupPriorities(matches: NormalizedMatch[]): CharacterRecord[] {
  const recent = ratingMatches(matches)
    .sort(
      (left, right) =>
        right.playedAtEpoch - left.playedAtEpoch || left.replayId.localeCompare(right.replayId),
    )
    .slice(0, 100);
  return matchupPriorities(aggregateMatches(recent).byOpponentCharacter);
}

// A deficit is the number of extra losses compared with an even record.
// Requiring ten decided matches keeps inconclusive records out of the ranking.
export function matchupPriorities(records: CharacterRecord[]): CharacterRecord[] {
  return records
    .filter((record) => record.wins + record.losses >= 10 && record.losses > record.wins)
    .sort(
      (left, right) =>
        right.losses - right.wins - (left.losses - left.wins) ||
        right.matches - left.matches ||
        compareCharacterSlugs(left.characterSlug, right.characterSlug),
    )
    .slice(0, 3);
}

export interface MatchupHighlights {
  /** Lowest win rate among characters with at least `minDecided` decided games. */
  lowestWinRate?: CharacterRecord;
  /** Most matches among characters with a losing record. */
  mostPlayedLosing?: CharacterRecord;
}

export function matchupHighlights(records: CharacterRecord[], minDecided = 5): MatchupHighlights {
  const decided = (record: CharacterRecord) => record.wins + record.losses;
  const lowestWinRate = records
    .filter((record) => record.winRate !== null && decided(record) >= minDecided)
    .sort(
      (left, right) =>
        (left.winRate ?? 0) - (right.winRate ?? 0) ||
        right.matches - left.matches ||
        compareCharacterSlugs(left.characterSlug, right.characterSlug),
    )[0];
  const mostPlayedLosing = records
    .filter((record) => record.losses > record.wins)
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        (left.winRate ?? 0) - (right.winRate ?? 0) ||
        compareCharacterSlugs(left.characterSlug, right.characterSlug),
    )[0];
  return { lowestWinRate, mostPlayedLosing };
}
