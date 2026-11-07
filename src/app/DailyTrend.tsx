import type { DailyRecord } from "../domain/statistics/aggregateMatches";
import { buildDailyWindow } from "../domain/statistics/dailyWindow";
import { formatWinRate } from "./format";

export function DailyTrend({
  records,
  locale,
  labels,
}: {
  records: DailyRecord[];
  locale: "ja" | "en";
  labels: Record<
    | "eyebrow"
    | "title"
    | "matches"
    | "winRate"
    | "wins"
    | "losses"
    | "other"
    | "noMatches"
    | "empty",
    string
  > & {
    activeDays: (count: number) => string;
  };
}) {
  const recent = buildDailyWindow(records, 14);
  const date = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  const trendSegments: string[][] = [];
  let segment: string[] = [];
  for (const [index, record] of recent.entries()) {
    if (record.winRate === null) {
      if (segment.length) trendSegments.push(segment);
      segment = [];
    } else segment.push(`${30 + index * 40},${110 - record.winRate}`);
  }
  if (segment.length) trendSegments.push(segment);
  return (
    <article className="daily-card ui-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h3 className="ui-title">{labels.title}</h3>
        </div>
        <span>{recent.length ? labels.activeDays(recent.length) : labels.empty}</span>
      </div>
      {recent.length > 0 && (
        <>
          <div className="daily-trend-chart">
            <p>
              {locale === "ja"
                ? "日別勝率の推移（試合なし・勝敗不明の日は途切れます）"
                : "Daily win rate (gaps indicate no decided games)"}
            </p>
            <svg
              viewBox="0 0 590 140"
              role="img"
              aria-label={locale === "ja" ? "日別勝率の推移" : "Daily win-rate trend"}
              preserveAspectRatio="xMidYMid meet"
            >
              {[0, 50, 100].map((value) => (
                <g key={value}>
                  <line
                    x1="30"
                    x2="570"
                    y1={110 - value}
                    y2={110 - value}
                    stroke="#454c55"
                    strokeDasharray="4 4"
                  />
                  <text x="0" y={114 - value}>
                    {value}%
                  </text>
                </g>
              ))}
              {trendSegments.map((points) => (
                <polyline
                  key={points[0]}
                  points={points.join(" ")}
                  fill="none"
                  stroke="#c7ff4a"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {recent.map((item, index) =>
                item.winRate === null ? null : (
                  <circle
                    key={item.date}
                    cx={30 + index * 40}
                    cy={110 - item.winRate}
                    r="3"
                    fill="#c7ff4a"
                  >
                    <title>
                      {item.date}: {formatWinRate(item.winRate)} ({item.matches} {labels.matches})
                    </title>
                  </circle>
                ),
              )}
              <text x="30" y="135">
                {recent[0]?.date.slice(5)}
              </text>
              <text x="570" y="135" textAnchor="end">
                {recent.at(-1)?.date.slice(5)}
              </text>
            </svg>
          </div>
          <details className="daily-detail-toggle">
            <summary>{locale === "ja" ? "日ごとの内訳" : "Daily breakdown"}</summary>
            <div className="daily-legend" aria-hidden="true">
              <span className="daily-key-win">{labels.wins}</span>
              <span className="daily-key-loss">{labels.losses}</span>
              <span className="daily-key-other">{labels.other}</span>
            </div>
            <div className="daily-grid">
              {recent.map((record) => {
                const other = record.draws + record.unknown;
                return (
                  <div className="daily-day" key={record.date}>
                    <div className="daily-day-heading">
                      <time dateTime={record.date}>
                        {date.format(new Date(`${record.date}T00:00:00+09:00`))}
                      </time>
                      <span>
                        {record.matches} {labels.matches}
                      </span>
                    </div>
                    {record.matches ? (
                      <>
                        <div className="daily-result-bar" aria-hidden="true">
                          <i className="daily-win" style={{ flexGrow: record.wins }} />
                          <i className="daily-loss" style={{ flexGrow: record.losses }} />
                          <i className="daily-other" style={{ flexGrow: other }} />
                        </div>
                        <div className="daily-result-detail">
                          <span>
                            {labels.wins} {record.wins} · {labels.losses} {record.losses}
                            {other > 0 ? ` · ${labels.other} ${other}` : ""}
                          </span>
                          <strong>
                            {labels.winRate} {formatWinRate(record.winRate)}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <p className="daily-empty">{labels.noMatches}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}
    </article>
  );
}
