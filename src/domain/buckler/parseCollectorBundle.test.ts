import { describe, expect, it } from "vitest";
import { parseCollectorImport } from "./parseCollectorBundle";

const SUBJECT = 1000000001;

function replay(id: string, subjectSide: 1 | 2, timestamp: number) {
  const subject = {
    player: { short_id: SUBJECT, fighter_id: "Subject" },
    playing_character_id: 21,
    playing_character_tool_name: "jamie",
    round_results: [1, 6],
  };
  const opponent = {
    player: { short_id: 2000000002, fighter_id: "Opponent" },
    playing_character_id: 1,
    playing_character_tool_name: "ryu",
    round_results: [0, 0],
  };
  return {
    replay_id: id,
    uploaded_at: timestamp,
    replay_battle_type: 1,
    replay_battle_type_name: "RANKED MATCH",
    player1_info: subjectSide === 1 ? subject : opponent,
    player2_info: subjectSide === 2 ? subject : opponent,
  };
}

function page(currentPage: number, totalPage: number, replays: unknown[]) {
  return {
    pageProps: {
      current_page: currentPage,
      total_page: totalPage,
      sid: SUBJECT,
      common: { statusCode: 200 },
      replay_list: replays,
    },
  };
}

function bundle(pages: unknown[]) {
  return {
    format: "sf6-battlegraph.collector",
    version: 1,
    userCode: SUBJECT,
    buildId: "synthetic-build-id",
    exportedAt: "2026-08-13T00:00:00.000Z",
    pages,
  };
}

function bundlePage(sourceType: string, pageNumber: number, response: unknown) {
  return {
    sourceType,
    sourcePath: `/battlelog/${sourceType}`,
    page: pageNumber,
    fetchedAt: "2026-08-13T00:00:00.000Z",
    response,
  };
}

describe("parseCollectorImport", () => {
  it("merges pages, deduplicates replay ids, and preserves source types", () => {
    const shared = replay("SHARED001", 1, 1_700_000_000);
    const input = bundle([
      bundlePage("all", 1, page(1, 1, [shared])),
      bundlePage("ranked", 1, page(1, 1, [shared, replay("RANKED02", 2, 1_699_999_900)])),
    ]);

    const result = parseCollectorImport(input, SUBJECT);

    expect(result.pageCount).toBe(2);
    expect(result.rawMatchCount).toBe(3);
    expect(result.uniqueMatchCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.matches[0].sourceTypes).toEqual(["all", "ranked"]);
    expect(result.matches[0].mode).toBe("ranked");
  });

  it("normalizes the subject to the same shape from either side", () => {
    const input = bundle([
      bundlePage("ranked", 1, page(1, 1, [
        replay("PLAYER001", 1, 1_700_000_000),
        replay("PLAYER002", 2, 1_699_999_900),
      ])),
    ]);

    const result = parseCollectorImport(input, SUBJECT);

    expect(result.matches.map((match) => match.subjectSide)).toEqual([1, 2]);
    expect(result.matches.every((match) => match.subject.player.short_id === SUBJECT)).toBe(true);
    expect(result.matches.every((match) => match.result === "win")).toBe(true);
  });

  it("warns about an incomplete source", () => {
    const input = bundle([
      bundlePage("casual", 1, page(1, 3, [replay("CASUAL001", 1, 1_700_000_000)])),
    ]);

    const result = parseCollectorImport(input, SUBJECT);

    expect(result.warnings).toContain("casual: imported 1 of 3 pages");
  });

  it("accepts an intentional stop at a known replay without an incomplete warning", () => {
    const input = {
      ...bundle([bundlePage("all", 1, page(1, 3, [replay("KNOWN001", 1, 1_700_000_000)]))]),
      stopReason: "known-replay",
      stoppedAtKnownReplayId: "KNOWN001",
    };

    expect(parseCollectorImport(input, SUBJECT).warnings).not.toContain("all: imported 1 of 3 pages");
  });

  it("warns when requested known boundaries have fallen outside the available history", () => {
    const input = {
      ...bundle([bundlePage("all", 1, page(1, 1, [replay("LATEST01", 1, 1_700_000_000)]))]),
      knownReplayBoundaryCount: 20,
    };

    expect(parseCollectorImport(input, SUBJECT).warnings).toContain("Known replay boundary was not found; all available pages were fetched");
  });

  it("continues to accept a single raw page", () => {
    const result = parseCollectorImport(
      page(1, 1, [replay("SINGLE001", 1, 1_700_000_000)]),
      SUBJECT,
    );

    expect(result.isSinglePage).toBe(true);
    expect(result.uniqueMatchCount).toBe(1);
  });
});
