import { describe, expect, it } from "vitest";
import { parseCurrentRatings } from "./currentRatings";

describe("profile current ratings", () => {
  it("reads character ratings and ignores unavailable values", () => {
    const response = {
      pageProps: {
        sid: 1,
        common: { statusCode: 200, isError: false },
        play: {
          character_league_infos: [
            { character_id: 10, league_info: { league_point: 25926, master_rating: 1500 } },
            { character_id: 21, league_info: { league_point: 20031, master_rating: 0 } },
            { character_id: 1, league_info: { league_point: -1, master_rating: 0 } },
          ],
        },
      },
    };
    const snapshot = { fetchedAt: "2026-10-29T00:00:00Z", response };
    expect(parseCurrentRatings(snapshot, 1)?.ratings).toEqual([
      { characterId: 10, leaguePoint: 25926, masterRating: 1500 },
      { characterId: 21, leaguePoint: 20031, masterRating: undefined },
    ]);
    expect(parseCurrentRatings(snapshot, 2)).toBeUndefined();
    expect(parseCurrentRatings({ ...snapshot, response: {} }, 1)).toBeUndefined();
  });
});
