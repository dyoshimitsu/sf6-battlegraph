import { describe, expect, it } from "vitest";
import { ACT_PERIODS, actForEpoch, actPeriods, availableActsForEpochs } from "./acts";

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

  it("starts Act 14 at the announced 16:00 JST", () => {
    expect(actForEpoch(Date.parse("2026-11-01T06:59:59Z") / 1000)?.id).toBe(13);
    expect(actForEpoch(Date.parse("2026-11-01T07:00:00Z") / 1000)?.id).toBe(14);
  });

  it("estimates Acts newer than the known list from the usual schedule", () => {
    const periods = actPeriods({ actId: 16, observedAt: "2027-05-20T00:00:00Z" });
    const estimated = periods.filter((act) => act.estimated);
    expect(
      estimated.map((act) => [act.id, new Date(act.startsAtEpoch * 1000).toISOString()]),
    ).toEqual([
      [15, "2027-02-01T07:00:00.000Z"],
      [16, "2027-05-01T07:00:00.000Z"],
    ]);
    expect(periods.find((act) => act.id === 14)?.endsAtEpoch).toBe(
      Date.parse("2027-02-01T07:00:00Z") / 1000 - 1,
    );
    expect(actForEpoch(Date.parse("2027-03-01T00:00:00Z") / 1000, periods)?.id).toBe(15);
  });

  it("never starts an estimated Act after it was observed", () => {
    const [act15] = actPeriods({ actId: 15, observedAt: "2027-01-20T00:00:00Z" }).filter(
      (act) => act.estimated,
    );
    expect(act15.startsAtEpoch).toBe(Date.parse("2027-01-20T00:00:00Z") / 1000);
    expect(actPeriods({ actId: 14, observedAt: "2026-11-02T00:00:00Z" })).toBe(ACT_PERIODS);
  });
});
