export interface ActPeriod {
  id: number;
  startsAtEpoch: number;
  endsAtEpoch: number | null;
  /** True when the start was inferred from the usual schedule rather than an announcement. */
  estimated?: boolean;
}

/** The current Act reported by a Buckler profile at a point in time. */
export interface ObservedAct {
  actId: number;
  observedAt: string;
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
  [14, "2026-11-01T16:00:00+09:00"],
] as const;

function withEnds(starts: { id: number; startsAtEpoch: number; estimated?: boolean }[]) {
  return starts.map(
    (start, index): ActPeriod => ({
      ...start,
      endsAtEpoch: starts[index + 1] ? starts[index + 1].startsAtEpoch - 1 : null,
    }),
  );
}

export const ACT_PERIODS: readonly ActPeriod[] = withEnds(
  ACT_STARTS.map(([id, startsAt]) => ({ id, startsAtEpoch: epoch(startsAt) })),
);

const JST_OFFSET_SECONDS = 9 * 3600;
/** Acts usually change on the 1st of these months (0-based) after maintenance. */
const SCHEDULE_MONTHS = [1, 4, 7, 10];
const SCHEDULE_HOUR_JST = 16;
const MIN_ACT_SECONDS = 45 * 86_400;

/** The first usual Act change at least `MIN_ACT_SECONDS` after `afterEpoch`. */
function nextScheduledStart(afterEpoch: number): number {
  const earliest = new Date((afterEpoch + MIN_ACT_SECONDS + JST_OFFSET_SECONDS) * 1000);
  for (let year = earliest.getUTCFullYear(); ; year += 1)
    for (const month of SCHEDULE_MONTHS) {
      const start = Date.UTC(year, month, 1, SCHEDULE_HOUR_JST) / 1000 - JST_OFFSET_SECONDS;
      if (start >= afterEpoch + MIN_ACT_SECONDS) return start;
    }
}

/**
 * Known Acts, followed by estimated Acts up to the one a Buckler profile reported. An estimated
 * Act starts at the usual schedule but never after it was first observed.
 */
export function actPeriods(observed?: ObservedAct | null): readonly ActPeriod[] {
  const last = ACT_PERIODS[ACT_PERIODS.length - 1];
  const observedAt = observed ? Date.parse(observed.observedAt) / 1000 : Number.NaN;
  if (!observed || observed.actId <= last.id || !Number.isFinite(observedAt)) return ACT_PERIODS;
  const starts: { id: number; startsAtEpoch: number; estimated?: boolean }[] = ACT_PERIODS.map(
    ({ id, startsAtEpoch, estimated }) => ({ id, startsAtEpoch, estimated }),
  );
  for (let id = last.id + 1; id <= observed.actId; id += 1) {
    const previous = starts[starts.length - 1].startsAtEpoch;
    starts.push({
      id,
      startsAtEpoch: Math.max(previous + 1, Math.min(nextScheduledStart(previous), observedAt)),
      estimated: true,
    });
  }
  return withEnds(starts);
}

export function actForEpoch(
  epochSeconds: number,
  periods: readonly ActPeriod[] = ACT_PERIODS,
): ActPeriod | null {
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index];
    if (epochSeconds >= period.startsAtEpoch) return period;
  }
  return null;
}

export function availableActsForEpochs(
  epochSeconds: Iterable<number>,
  periods: readonly ActPeriod[] = ACT_PERIODS,
): ActPeriod[] {
  const ids = new Set<number>();
  for (const value of epochSeconds) {
    const act = actForEpoch(value, periods);
    if (act) ids.add(act.id);
  }
  return periods.filter((act) => ids.has(act.id));
}
