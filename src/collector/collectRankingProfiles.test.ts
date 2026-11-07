import { describe, expect, it, vi } from "vitest";
import type { BucklerCollectorBundle } from "../domain/buckler/types";
import { collectRankingProfiles, latestRankedCharacterSlug } from "./collectRankingProfiles";

const SUBJECT = 1000000001;

function replay(uploadedAt: number, type: number, slug: string, subjectSide: 1 | 2) {
  const subject = { player: { short_id: SUBJECT }, character_tool_name: slug };
  const opponent = { player: { short_id: 2000000002 }, character_tool_name: "ryu" };
  return {
    replay_id: `R${uploadedAt}`,
    uploaded_at: uploadedAt,
    replay_battle_type: type,
    player1_info: subjectSide === 1 ? subject : opponent,
    player2_info: subjectSide === 1 ? opponent : subject,
  };
}

const bundle = {
  format: "sf6-battlegraph.collector",
  version: 1,
  userCode: SUBJECT,
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
            replay(30, 2, "ken", 1),
            replay(20, 1, "jamie", 2),
            replay(10, 1, "ken", 1),
          ],
        },
      },
    },
  ],
} as unknown as BucklerCollectorBundle;

function leader(order: number, shortId: number) {
  return { order, fighter_banner_info: { personal_info: { short_id: shortId } } };
}

describe("ranking leader collection", () => {
  it("uses the character from the latest ranked match", () => {
    expect(latestRankedCharacterSlug(bundle)).toBe("jamie");
  });

  it("fetches the top profiles in ranking order, skipping the subject", async () => {
    const ranking = {
      pageProps: {
        master_rating_ranking: {
          ranking_fighter_list: [
            leader(2, 12),
            leader(1, SUBJECT),
            leader(3, 13),
            leader(4, 14),
            leader(5, 15),
          ],
        },
      },
    };
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/ranking/master.json")
        ? new Response(JSON.stringify(ranking))
        : String(url).includes("/profile/13/")
          ? new Response("{}", { status: 500 })
          : new Response(JSON.stringify({ pageProps: { url: String(url) } })),
    );
    const snapshot = await collectRankingProfiles(
      bundle,
      fetcher,
      "https://www.streetfighter.com",
      "ja-jp",
      () => new Date("2026-08-13T00:00:00Z"),
      0,
    );
    expect(String(fetcher.mock.calls[0][0])).toContain("character_id=jamie");
    expect(snapshot?.characterSlug).toBe("jamie");
    expect(snapshot?.topProfiles.map((item) => [item.order, item.userCode])).toEqual([
      [2, 12],
      [4, 14],
    ]);
  });
});
