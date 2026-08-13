import type { NormalizedMatch } from "../buckler/types";

export function isRankedMatch(match: NormalizedMatch): boolean {
  if (match.battleType === 1) return true;
  if (match.battleTypeName?.trim().toUpperCase() === "RANKED MATCH") return true;
  return match.mode === "ranked" || match.sourceTypes.includes("ranked");
}

export function ratingMatches(matches: NormalizedMatch[]): NormalizedMatch[] {
  return matches.filter(isRankedMatch);
}
