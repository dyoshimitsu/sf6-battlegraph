import {
  CHARACTER_ORDER,
  compareCharacterSlugs,
  normalizeCharacterSlug,
} from "../buckler/characterOrder";
import type { CharacterRecord } from "./aggregateMatches";

export function completeOpponentRoster(
  records: CharacterRecord[],
  characterName: (slug: string) => string,
): CharacterRecord[] {
  const existing = new Set(records.map((record) => normalizeCharacterSlug(record.characterSlug)));
  const empty = CHARACTER_ORDER.filter((slug) => !existing.has(slug)).map(
    (slug): CharacterRecord => ({
      characterId: null,
      characterName: characterName(slug),
      characterSlug: slug,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      unknown: 0,
      winRate: null,
    }),
  );
  return [...records, ...empty].sort(
    (left, right) =>
      right.matches - left.matches ||
      compareCharacterSlugs(left.characterSlug, right.characterSlug),
  );
}
