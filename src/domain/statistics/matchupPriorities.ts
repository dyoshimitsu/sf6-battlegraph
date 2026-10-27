import { compareCharacterSlugs } from "../buckler/characterOrder";
import type { CharacterRecord } from "./aggregateMatches";

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
