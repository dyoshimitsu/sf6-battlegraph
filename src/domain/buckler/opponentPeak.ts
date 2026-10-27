import type { OpponentPeak, OpponentPeakSnapshot } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseOpponentPeak(snapshot: OpponentPeakSnapshot): OpponentPeak | undefined {
  const response = snapshot.response;
  if (
    !record(response) ||
    !record(response.response) ||
    !Array.isArray(response.response.character_league_infos)
  )
    throw new Error("Invalid opponent peak response");
  let best: OpponentPeak | undefined;
  for (const entry of response.response.character_league_infos) {
    if (
      !record(entry) ||
      !record(entry.league_info) ||
      typeof entry.league_info.master_rating !== "number" ||
      !Number.isFinite(entry.league_info.master_rating) ||
      typeof entry.character_id !== "number" ||
      typeof entry.character_name !== "string" ||
      typeof entry.character_tool_name !== "string"
    )
      throw new Error("Invalid opponent peak character");
    const rating = entry.league_info.master_rating;
    if (rating > 0 && (!best || rating > best.rating)) {
      best = {
        actId: snapshot.actId,
        fetchedAt: snapshot.fetchedAt,
        rating,
        characterId: entry.character_id,
        characterName: entry.character_name,
        characterSlug: entry.character_tool_name,
      };
    }
  }
  return best;
}
