import { describe, expect, it } from "vitest";
import { ACT_PERIODS, actForEpoch, availableActsForEpochs } from "./acts";

describe("Master League Act periods", () => {
  it("assigns reset-boundary matches to the new Act", () => {
    const act7 = ACT_PERIODS.find((act) => act.id === 7);
    const act8 = ACT_PERIODS.find((act) => act.id === 8);
    expect(act7).toBeDefined();
    expect(act8).toBeDefined();
    if (!act7 || !act8) throw new Error("required Act periods are missing");

    expect(actForEpoch(act7.endsAtEpoch ?? 0)?.id).toBe(7);
    expect(actForEpoch(act8.startsAtEpoch)?.id).toBe(8);
  });

  it("uses the maintenance completion time, not the calendar date", () => {
    const act2 = ACT_PERIODS.find((act) => act.id === 2);
    expect(act2).toBeDefined();
    if (!act2) throw new Error("Act 2 is missing");

    expect(actForEpoch(Date.parse("2023-11-01T06:59:59Z") / 1000)?.id).toBe(1);
    expect(actForEpoch(act2.startsAtEpoch)?.id).toBe(2);
  });

  it("does not assign matches before Master League began", () => {
    expect(actForEpoch(Date.parse("2023-08-01T02:59:59Z") / 1000)).toBeNull();
  });

  it("returns only the Acts represented by stored matches", () => {
    const act4 = ACT_PERIODS.find((act) => act.id === 4);
    const act13 = ACT_PERIODS.find((act) => act.id === 13);
    expect(act4).toBeDefined();
    expect(act13).toBeDefined();
    if (!act4 || !act13) throw new Error("required Act periods are missing");

    expect(availableActsForEpochs([act13.startsAtEpoch, act4.startsAtEpoch])).toEqual([
      act4,
      act13,
    ]);
  });
});
