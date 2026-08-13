import { describe, expect, it } from "vitest";
import { getSyncFreshness, readLastSyncedAtEpoch } from "./syncFreshness";

describe("sync freshness", () => {
  it("uses the explicit manifest timestamp", () => {
    expect(readLastSyncedAtEpoch({ syncedAtEpoch: 123, sourceSyncId: "999000-id" })).toBe(123);
  });

  it("recovers the timestamp from an existing sync id", () => {
    expect(readLastSyncedAtEpoch({ sourceSyncId: "1738368000123-id" })).toBe(1_738_368_000);
  });

  it("classifies seven and fourteen day thresholds", () => {
    const now = 2_000_000;
    expect(getSyncFreshness(now - 6 * 86_400, now)).toEqual({ days: 6, level: "fresh" });
    expect(getSyncFreshness(now - 7 * 86_400, now)).toEqual({ days: 7, level: "warning" });
    expect(getSyncFreshness(now - 14 * 86_400, now)).toEqual({ days: 14, level: "urgent" });
  });

  it("does not report a negative age for a future timestamp", () => {
    expect(getSyncFreshness(200, 100)).toEqual({ days: 0, level: "fresh" });
  });
});
