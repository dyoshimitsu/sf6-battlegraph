import { describe, expect, it } from "vitest";
import { inferBattleMode } from "./battleModes";

describe("inferBattleMode", () => {
  it.each([
    [1, "RANKED MATCH", "ranked"],
    [99, "CASUAL MATCH", "casual"],
    [99, "CUSTOM ROOM", "custom"],
    [99, "BATTLE HUB", "hub"],
  ] as const)("maps battle type %s (%s) to %s", (type, name, expected) => {
    expect(
      inferBattleMode({ replay_battle_type: type, replay_battle_type_name: name }, "all"),
    ).toBe(expected);
  });

  it("prefers a recognized name and preserves unknown values", () => {
    expect(
      inferBattleMode({ replay_battle_type: 99, replay_battle_type_name: "RANKED MATCH" }, "all"),
    ).toBe("ranked");
    expect(
      inferBattleMode({ replay_battle_type: 99, replay_battle_type_name: "NEW MODE" }, "all"),
    ).toBe("unknown");
    expect(inferBattleMode({ replay_battle_type: 2 }, "all")).toBe("unknown");
  });
});
