import type { NormalizedMatch } from "../buckler/types";
import { recentMatchSummary } from "./aggregateMatches";

const fields = [
  "drive_impact",
  "drive_parry",
  "just_parry",
  "throw_count",
  "corner_time",
  "cornered_time",
  "received_drive_impact",
  "drive_impact_to_drive_impact",
  "received_drive_impact_to_drive_impact",
  "punish_counter",
  "received_punish_counter",
  "received_throw_count",
  "throw_tech",
  "throw_drive_parry",
  "received_throw_drive_parry",
  "drive_reversal",
  "stun",
  "received_stun",
  "gauge_rate_drive_arts",
  "gauge_rate_drive_guard",
  "gauge_rate_drive_other",
  "gauge_rate_drive_impact",
  "gauge_rate_drive_reversal",
  "gauge_rate_drive_rush_from_cancel",
  "gauge_rate_drive_rush_from_parry",
  "gauge_rate_sa_lv1",
  "gauge_rate_sa_lv2",
  "gauge_rate_sa_lv3",
  "gauge_rate_ca",
] as const;
export type HabitField = (typeof fields)[number];

export type ProfileHabits = {
  fetchedAt: string;
  values: Partial<Record<(typeof fields)[number], number>>;
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseProfileHabits(
  raw: unknown,
  fetchedAt: unknown,
  userCode: number,
): ProfileHabits | null {
  const props = object(object(raw)?.pageProps),
    common = object(props?.common);
  const stats = object(object(props?.play)?.battle_stats);
  if (
    props?.sid !== userCode ||
    common?.statusCode !== 200 ||
    common?.isError === true ||
    !stats ||
    typeof fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(fetchedAt))
  )
    return null;
  const values: ProfileHabits["values"] = {};
  for (const field of fields) {
    const value = stats[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[field] = value;
  }
  return Object.keys(values).length ? { fetchedAt, values } : null;
}

export function bestProfileHabits(snapshots: ProfileHabits[], matches: NormalizedMatch[]) {
  const ranked = snapshots.flatMap((snapshot) => {
    const cutoff = Date.parse(snapshot.fetchedAt) / 1000;
    const eligible = matches.filter((match) => match.playedAtEpoch <= cutoff);
    if (eligible.length < 100) return [];
    const record = recentMatchSummary(eligible, 100);
    return record.winRate === null ? [] : [{ snapshot, record }];
  });
  return ranked.sort(
    (a, b) =>
      (b.record.winRate ?? 0) - (a.record.winRate ?? 0) ||
      Date.parse(b.snapshot.fetchedAt) - Date.parse(a.snapshot.fetchedAt),
  )[0];
}

export interface RankingLeaders {
  characterSlug: string;
  fetchedAt: string;
  profiles: ProfileHabits[];
}

/** Mean of each field over the profiles that report it. */
export function averageProfileHabits(
  profiles: ProfileHabits[],
): Partial<Record<HabitField, { value: number; count: number }>> {
  const result: Partial<Record<HabitField, { value: number; count: number }>> = {};
  for (const field of fields) {
    const values = profiles.flatMap((profile) => {
      const value = profile.values[field];
      return value === undefined ? [] : [value];
    });
    if (values.length)
      result[field] = {
        value: values.reduce((sum, value) => sum + value, 0) / values.length,
        count: values.length,
      };
  }
  return result;
}
