import type { DailyRecord } from "../domain/statistics/aggregateMatches";
import { buildDailyWindow } from "../domain/statistics/dailyWindow";
import { formatWinRate } from "./format";
import { WinRateColumns } from "./WinRateColumns";

export function DailyTrend({
  records,
  locale,
  labels,
}: {
  records: DailyRecord[];
  locale: "ja" | "en";
  labels: Record<"title" | "winRate" | "wins" | "losses" | "other" | "empty", string> & {
    activeDays: (count: number) => string;
  };
}) {
  const recent = buildDailyWindow(records, 14);
  const ja = locale === "ja";
  const day = new Intl.DateTimeFormat(ja ? "ja-JP" : "en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  return (
    <article className="daily-card ui-card">
      <div className="daily-heading">
        <h3 className="ui-title">{labels.title}</h3>
        <span className="ui-caption">
          {recent.length
            ? `${labels.activeDays(recent.length)} · ${ja ? "絞込後 · 勝率は勝敗のみ" : "Filtered · decided games only"}`
            : labels.empty}
        </span>
      </div>
      {recent.length > 0 && (
        <>
          <WinRateColumns
            ariaLabel={ja ? "日別の勝率と対戦数" : "Daily win rate and matches"}
            matchUnit={ja ? "戦" : "g"}
            lowSampleThreshold={5}
            minColumnWidth={36}
            columns={recent.map((record) => {
              const label = day.format(new Date(`${record.date}T00:00:00+09:00`));
              const other = record.draws + record.unknown;
              return {
                key: record.date,
                label,
                record,
                description: `${label} · ${labels.winRate} ${formatWinRate(record.winRate)} · ${labels.wins} ${record.wins} · ${labels.losses} ${record.losses}${other ? ` · ${labels.other} ${other}` : ""}`,
              };
            })}
          />
          <small className="ui-note">
            {ja ? "薄色：勝敗判明5戦未満" : "Muted: fewer than 5 decided games"}
          </small>
        </>
      )}
    </article>
  );
}
