import { describe, expect, it } from "vitest";
import { movingAverage } from "./movingAverage";

describe("movingAverage", () => {
  it("uses the preceding ten matches, including matches before a visible filter", () => {
    const history = Array.from({ length: 12 }, (_, index) => 1000 + index * 10);
    expect(movingAverage(history, 10).slice(9)).toEqual([1045, 1055, 1065]);
    expect(movingAverage(history, 10).slice(10)).toEqual([1055, 1065]);
  });
  it("does not bridge missing ratings or use incomplete windows", () => {
    expect(movingAverage([1, 2, null, 4, 5, 6], 3)).toEqual([null, null, null, null, null, 5]);
  });
});
