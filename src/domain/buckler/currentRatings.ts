export interface CurrentRatings {
  fetchedAt: string;
  ratings: { characterId: number; leaguePoint?: number; masterRating?: number }[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseCurrentRatings(
  snapshot: { fetchedAt: string; response: unknown },
  userCode: number,
): CurrentRatings | undefined {
  const props = record(record(snapshot.response)?.pageProps);
  const common = record(props?.common);
  const play = record(props?.play);
  if (
    props?.sid !== userCode ||
    common?.statusCode !== 200 ||
    common?.isError === true ||
    !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
    !Array.isArray(play?.character_league_infos)
  )
    return undefined;
  const ratings: CurrentRatings["ratings"] = [];
  for (const value of play.character_league_infos) {
    const entry = record(value);
    const info = record(entry?.league_info);
    const characterId = entry?.character_id;
    if (
      typeof characterId !== "number" ||
      !Number.isSafeInteger(characterId) ||
      characterId < 0 ||
      !info
    )
      continue;
    const lp = info.league_point;
    const mr = info.master_rating;
    const leaguePoint =
      typeof lp === "number" && Number.isSafeInteger(lp) && lp > 0 ? lp : undefined;
    const masterRating =
      typeof mr === "number" && Number.isSafeInteger(mr) && mr > 0 ? mr : undefined;
    if (leaguePoint !== undefined || masterRating !== undefined)
      ratings.push({ characterId, leaguePoint, masterRating });
  }
  return { fetchedAt: snapshot.fetchedAt, ratings };
}
