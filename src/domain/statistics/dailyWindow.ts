import type { DailyRecord } from "./aggregateMatches";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildDailyWindow(records: DailyRecord[], dayCount = 14): DailyRecord[] {
  if (records.length === 0 || dayCount <= 0) return [];
  const byDate = new Map(records.map(record => [record.date, record]));
  const end = new Date(`${records.at(-1)?.date}T00:00:00Z`);
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (dayCount - index - 1));
    const key = isoDate(date);
    return byDate.get(key) ?? { date: key, matches: 0, wins: 0, losses: 0, draws: 0, unknown: 0, winRate: null };
  });
}
