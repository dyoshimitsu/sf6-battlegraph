import { describe, expect, it, vi } from "vitest";
import { parseOpponentPeak } from "../domain/buckler/opponentPeak";
import type { BucklerCollectorBundle } from "../domain/buckler/types";
import { collectOpponentPeaks } from "./collectOpponentPeaks";

const response = {
  response: {
    character_league_infos: [
      {
        character_id: 1,
        character_name: "リュウ",
        character_tool_name: "ryu",
        league_info: { master_rating: 1400 },
      },
      {
        character_id: 28,
        character_name: "舞",
        character_tool_name: "mai",
        league_info: { master_rating: 1591 },
      },
      {
        character_id: 3,
        character_name: "キンバリー",
        character_tool_name: "kimberly",
        league_info: { master_rating: 0 },
      },
    ],
  },
};

describe("opponent peak collection", () => {
  it("fetches each opponent once and keeps the full response and highest character", async () => {
    const bundle: BucklerCollectorBundle = {
      format: "sf6-battlegraph.collector",
      version: 1,
      userCode: 1,
      buildId: "build",
      exportedAt: "2026-08-13T00:00:00Z",
      pages: [
        {
          sourceType: "all",
          sourcePath: "/battlelog",
          page: 1,
          fetchedAt: "2026-08-13T00:00:00Z",
          response: {
            pageProps: {
              replay_list: [
                {
                  player1_info: { player: { short_id: 1 } },
                  player2_info: { player: { short_id: 2 } },
                },
                {
                  player1_info: { player: { short_id: 2 } },
                  player2_info: { player: { short_id: 1 } },
                },
              ],
            },
          },
        },
      ],
    };
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "POST" ? response : { pageProps: { play: { current_season_id: 13 } } },
          ),
        ),
    );
    const snapshots = await collectOpponentPeaks(
      bundle,
      fetcher,
      "https://www.streetfighter.com",
      "ja-jp",
      () => new Date("2026-08-13T00:00:00Z"),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      targetShortId: 2,
      targetSeasonId: 13,
      locale: "ja-jp",
      peak: false,
    });
    expect(snapshots[0].response).toEqual(response);
    expect(parseOpponentPeak(snapshots[0])).toMatchObject({
      rating: 1591,
      characterId: 28,
      actId: 13,
    });
  });

  it("treats zero MR as no recorded peak and rejects malformed data", () => {
    const snapshot = {
      userCode: 2,
      actId: 13,
      fetchedAt: "2026-08-13T00:00:00Z",
      response: {
        response: {
          character_league_infos: [
            {
              character_id: 1,
              character_name: "リュウ",
              character_tool_name: "ryu",
              league_info: { master_rating: 0 },
            },
          ],
        },
      },
    };
    expect(parseOpponentPeak(snapshot)).toBeUndefined();
    expect(() => parseOpponentPeak({ ...snapshot, response: {} })).toThrow();
  });
});
