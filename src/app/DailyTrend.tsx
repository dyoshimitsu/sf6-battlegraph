import type { DailyRecord } from "../domain/statistics/aggregateMatches";
import { buildDailyWindow } from "../domain/statistics/dailyWindow";
import type { DailyRatingChange } from "../domain/statistics/matchPatterns";
import { formatWinRate } from "./format";
import { WinRateColumns } from "./WinRateColumns";

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

export function DailyTrend({
  records,
  ratingChanges,
  locale,
  labels,
}: {
  records: DailyRecord[];
  ratingChanges: Map<string, DailyRatingChange>;
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
              const change = ratingChanges.get(record.date);
              const changes = (
                [
                  ["LP", change?.leaguePoint],
                  ["MR", change?.masterRating],
                ] as const
              ).filter((entry): entry is readonly ["LP" | "MR", number] => entry[1] !== undefined);
              return {
                note: changes.length ? (
                  <span className="rate-column-change">
                    {changes.map(([kind, value]) => (
                      <em key={kind} className={value >= 0 ? "positive" : "negative"}>
                        {kind} {signed(value)}
                      </em>
                    ))}
                  </span>
                ) : undefined,
                key: record.date,
                label,
                record,
                description: `${label} · ${labels.winRate} ${formatWinRate(record.winRate)} · ${labels.wins} ${record.wins} · ${labels.losses} ${record.losses}${other ? ` · ${labels.other} ${other}` : ""}${changes.map(([kind, value]) => ` · ${kind} ${signed(value)}`).join("")}`,
              };
            })}
          />
          <small className="ui-note">
            {ja
              ? "薄色：勝敗判明5戦未満 · LP/MR：ランクマッチで同キャラの前試合からの増減（推定）"
              : "Muted: fewer than 5 decided games · LP/MR: change from the previous ranked match of the same character (estimate)"}
          </small>
        </>
      )}
    </article>
  );
}
