import { describe, expect, it, vi } from "vitest";
import {
  buildBattleLogDataUrl,
  type CollectorSource,
  collectBattleLogs,
  DEFAULT_COLLECTOR_SOURCES,
  MODE_SPECIFIC_COLLECTOR_SOURCES,
} from "./collectBattleLogs";

const USER_CODE = 1000000001;

function page(currentPage: number, totalPage: number, replayId: string) {
  return {
    pageProps: {
      current_page: currentPage,
      total_page: totalPage,
      sid: USER_CODE,
      common: { statusCode: 200 },
      replay_list: [
        {
          replay_id: replayId,
          uploaded_at: 1_700_000_000 - currentPage,
          player1_info: { player: { short_id: USER_CODE } },
          player2_info: { player: { short_id: 2000000002 } },
        },
      ],
    },
  };
}

describe("buildBattleLogDataUrl", () => {
  it("collects only the combined battle log by default", () => {
    expect(DEFAULT_COLLECTOR_SOURCES).toEqual([
      { sourceType: "all", sourcePath: "/battlelog", routeSuffix: "" },
    ]);
    expect(MODE_SPECIFIC_COLLECTOR_SOURCES).toHaveLength(4);
  });

  it("builds a locale and mode-specific Next.js data URL", () => {
    const url = buildBattleLogDataUrl(
      "https://www.streetfighter.com",
      "build_123",
      "ja-JP",
      USER_CODE,
      "/rank",
      3,
    );

    expect(url).toBe(
      "https://www.streetfighter.com/6/buckler/_next/data/build_123/ja-jp/profile/1000000001/battlelog/rank.json?page=3&sid=1000000001",
    );
  });

  it("rejects unsafe dynamic path values", () => {
    expect(() =>
      buildBattleLogDataUrl("https://example.com", "../bad", "ja-jp", USER_CODE, "", 1),
    ).toThrow("buildId contains unsupported characters");
  });
});

describe("collectBattleLogs", () => {
  it("fetches every page for each source and preserves raw responses", async () => {
    const source: CollectorSource = {
      sourceType: "ranked",
      sourcePath: "/battlelog/rank",
      routeSuffix: "/rank",
    };
    const responses = [page(1, 2, "SYNTH001"), page(2, 2, "SYNTH002")];
    const fetcher = vi.fn(async () => {
      const body = responses.shift();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const bundle = await collectBattleLogs({
      buildId: "build_123",
      locale: "ja-jp",
      userCode: USER_CODE,
      origin: "https://www.streetfighter.com",
      sources: [source],
      fetcher,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      delayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bundle.pages.map((item) => item.page)).toEqual([1, 2]);
    expect(bundle.pages[1].response).toEqual(page(2, 2, "SYNTH002"));
    expect(bundle.exportedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("stops without returning a partial bundle when a request fails", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ error: true }), { status: 403 }),
    );

    await expect(
      collectBattleLogs({
        buildId: "build_123",
        locale: "ja-jp",
        userCode: USER_CODE,
        origin: "https://www.streetfighter.com",
        sources: [{ sourceType: "all", sourcePath: "/battlelog", routeSuffix: "" }],
        fetcher,
        delayMs: 0,
      }),
    ).rejects.toThrow("HTTP 403");
  });

  it("stops after preserving the page containing a known replay", async () => {
    const responses = [page(1, 3, "NEW00001"), page(2, 3, "KNOWN001"), page(3, 3, "OLD00001")];
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );
    const bundle = await collectBattleLogs({
      buildId: "build_123",
      locale: "ja-jp",
      userCode: USER_CODE,
      origin: "https://www.streetfighter.com",
      fetcher,
      knownReplayIds: ["KNOWN001"],
      delayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bundle.pages.map((item) => item.page)).toEqual([1, 2]);
    expect(bundle).toMatchObject({
      stopReason: "known-replay",
      stoppedAtKnownReplayId: "KNOWN001",
      knownReplayBoundaryCount: 1,
    });
  });
});
