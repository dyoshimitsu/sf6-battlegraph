import { describe, expect, it } from "vitest";
import { parseBucklerPage } from "./parseBucklerPage";
import { BucklerValidationError } from "./types";

function createResponse() {
  return {
    pageProps: {
      current_page: 1,
      total_page: 2,
      sid: 1000000001,
      common: { statusCode: 200, isError: false },
      replay_list: [
        {
          replay_id: "SYNTHETIC1",
          uploaded_at: 1_700_000_000,
          battle_version: 10000000,
          replay_battle_type: 1,
          replay_battle_type_name: "RANKED MATCH",
          player1_info: {
            player: { short_id: 1000000001, fighter_id: "Subject" },
          },
          player2_info: {
            player: { short_id: 2000000002, fighter_id: "Opponent" },
          },
        },
      ],
    },
    __N_SSP: true,
  };
}

describe("parseBucklerPage", () => {
  it("validates and summarizes a Buckler page", () => {
    const preview = parseBucklerPage(createResponse(), 1000000001);

    expect(preview.userCode).toBe(1000000001);
    expect(preview.matchCount).toBe(1);
    expect(preview.subjectMatches).toBe(1);
    expect(preview.battleTypes).toEqual(["RANKED MATCH"]);
    expect(preview.oldestPlayedAt).toBe(1_700_000_000);
    expect(preview.warnings).toEqual([]);
  });

  it("rejects an authentication error response", () => {
    const response = createResponse();
    response.pageProps.common.statusCode = 403;

    expect(() => parseBucklerPage(response)).toThrow(BucklerValidationError);
  });

  it("rejects a response for another user", () => {
    expect(() => parseBucklerPage(createResponse(), 9999999999)).toThrow(
      "Expected user code 9999999999",
    );
  });

  it("warns when the subject is missing from a replay", () => {
    const response = createResponse();
    response.pageProps.replay_list[0].player1_info.player.short_id = 3000000003;

    const preview = parseBucklerPage(response);

    expect(preview.subjectMatches).toBe(0);
    expect(preview.warnings).toHaveLength(1);
  });
});
