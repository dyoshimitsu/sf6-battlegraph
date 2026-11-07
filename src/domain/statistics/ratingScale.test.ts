import { describe, expect, it } from "vitest";
import { ratingScale } from "./ratingScale";

describe("ratingScale", () => {
  it("uses the full history and keeps a bounded tick count", () => {
    expect(ratingScale([1000, 1450, 2100], 100)).toEqual({ min: 1000, max: 2100, step: 200 });
  });

  it("adds padding for a constant rating", () => {
    expect(ratingScale([1500], 100)).toEqual({ min: 1400, max: 1600, step: 100 });
  });
});
