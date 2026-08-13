export interface ActPeriod {
  id: number;
  startsAtEpoch: number;
  endsAtEpoch: number | null;
}

function epoch(isoDateTime: string): number {
  return Date.parse(isoDateTime) / 1000;
}

/**
 * Master League Acts in Asia/Tokyo.
 *
 * The boundary is represented as the first instant of the next Act. Keeping
 * timestamps (rather than dates) prevents an overnight match from being
 * attributed to the wrong Act at a reset boundary.
 */
const ACT_STARTS = [
  [1, "2023-08-01T16:00:00+09:00"],
  [2, "2023-11-01T16:00:00+09:00"],
  [3, "2024-02-01T16:00:00+09:00"],
  [4, "2024-05-01T12:00:00+09:00"],
  [5, "2024-08-01T12:00:00+09:00"],
  [6, "2024-12-01T12:00:00+09:00"],
  [7, "2025-02-05T12:00:00+09:00"],
  [8, "2025-05-01T12:00:00+09:00"],
  [9, "2025-08-01T12:00:00+09:00"],
  [10, "2025-11-01T12:00:00+09:00"],
  [11, "2026-02-01T12:00:00+09:00"],
  [12, "2026-05-01T12:00:00+09:00"],
  [13, "2026-08-01T12:00:00+09:00"],
] as const;

export const ACT_PERIODS: readonly ActPeriod[] = ACT_STARTS.map(([id, startsAt], index) => ({
  id,
  startsAtEpoch: epoch(startsAt),
  endsAtEpoch: ACT_STARTS[index + 1] ? epoch(ACT_STARTS[index + 1][1]) - 1 : null,
}));

export function actForEpoch(epochSeconds: number): ActPeriod | null {
  for (let index = ACT_PERIODS.length - 1; index >= 0; index -= 1) {
    const period = ACT_PERIODS[index];
    if (epochSeconds >= period.startsAtEpoch) return period;
  }
  return null;
}

export function availableActsForEpochs(epochSeconds: Iterable<number>): ActPeriod[] {
  const ids = new Set<number>();
  for (const value of epochSeconds) {
    const act = actForEpoch(value);
    if (act) ids.add(act.id);
  }
  return ACT_PERIODS.filter((act) => ids.has(act.id));
}
