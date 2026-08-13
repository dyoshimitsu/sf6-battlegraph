import type { NormalizedMatch } from "../buckler/types";

export function isRankedMatch(match: NormalizedMatch): boolean {
  if (match.battleType === 1) return true;
  if (match.battleTypeName?.trim().toUpperCase() === "RANKED MATCH") return true;
  return match.mode === "ranked" || match.sourceTypes.includes("ranked");
}

export function ratingMatches(matches: NormalizedMatch[]): NormalizedMatch[] {
  return matches.filter(isRankedMatch);
}

export function ratingCharacterKey(match: NormalizedMatch): string {
  const id = match.subject.playing_character_id ?? match.subject.character_id;
  const slug =
    match.subject.playing_character_tool_name ?? match.subject.character_tool_name ?? "unknown";
  return id === undefined ? `slug:${slug}` : `id:${id}`;
}

export function latestRatingCharacterKey(matches: NormalizedMatch[]): string {
  const latest = ratingMatches(matches).reduce<NormalizedMatch | undefined>(
    (current, match) => (!current || match.playedAtEpoch > current.playedAtEpoch ? match : current),
    undefined,
  );
  return latest ? ratingCharacterKey(latest) : "";
}
