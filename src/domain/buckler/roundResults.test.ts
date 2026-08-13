import { describe, expect, it } from "vitest";
import { getRoundDetails } from "./roundResults";

describe("getRoundDetails", () => {
  it("uses the winner's code to describe each round", () => {
    expect(getRoundDetails([6, 0, 7], [0, 8, 0], "ja")).toEqual([
      { round: 1, outcome: "win", code: 6, method: "SA", description: "スーパーアーツ" },
      { round: 2, outcome: "loss", code: 8, method: "P", description: "パーフェクト" },
      { round: 3, outcome: "win", code: 7, method: "CA", description: "クリティカルアーツ" },
    ]);
  });

  it("preserves an unknown future result code", () => {
    expect(getRoundDetails([9], [0], "en")[0]).toMatchObject({
      outcome: "win",
      code: 9,
      method: "#9",
      description: "Unknown result code 9",
    });
  });
});
