import { describe, expect, it } from "vitest";
import { getCharacterName } from "./characterNames";

describe("getCharacterName", () => {
  const player = {
    player: { short_id: 1000000001 },
    playing_character_name: "春麗",
    playing_character_tool_name: "chunli",
  };

  it("uses the localized Buckler name for Japanese", () => {
    expect(getCharacterName(player, "ja")).toBe("春麗");
  });

  it("uses the canonical English name derived from the tool slug", () => {
    expect(getCharacterName(player, "en")).toBe("Chun-Li");
  });

  it("preserves an unknown character instead of dropping it", () => {
    expect(
      getCharacterName(
        {
          player: { short_id: 1000000001 },
          character_name: "新キャラクター",
          character_tool_name: "newfighter",
        },
        "en",
      ),
    ).toBe("新キャラクター");
  });
});
