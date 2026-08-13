import type { NormalizedMatch } from "../buckler/types";

export interface MatchSideReadPort {
  getMatchSides(userCode: number, replayIds: string[]): Promise<Map<string, 1 | 2>>;
}

export interface HydratedMatchSides {
  matches: NormalizedMatch[];
  hydratedCount: number;
}

export async function hydrateMatchSides(
  port: MatchSideReadPort,
  userCode: number,
  matches: NormalizedMatch[],
): Promise<HydratedMatchSides> {
  const missingIds = matches
    .filter((match) => match.subjectSide === null)
    .map((match) => match.replayId);
  if (!missingIds.length) return { matches, hydratedCount: 0 };

  const sides = await port.getMatchSides(userCode, missingIds);
  let hydratedCount = 0;
  const hydrated = matches.map((match) => {
    if (match.subjectSide !== null) return match;
    const subjectSide = sides.get(match.replayId);
    if (subjectSide === undefined) return match;
    hydratedCount += 1;
    return {
      ...match,
      subjectSide,
      raw: {
        ...match.raw,
        player1_info: subjectSide === 1 ? match.subject : match.opponent,
        player2_info: subjectSide === 2 ? match.subject : match.opponent,
      },
    };
  });
  return { matches: hydrated, hydratedCount };
}
