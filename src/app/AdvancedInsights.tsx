import { useMemo } from "react";
import type { NormalizedMatch } from "../domain/buckler/types";
import { advancedInsights } from "../domain/statistics/advancedInsights";
import { recentMatchSummary } from "../domain/statistics/aggregateMatches";
import { formatWinRate } from "./format";

export function AdvancedInsights({
  matches,
  locale,
}: {
  matches: NormalizedMatch[];
  locale: "ja" | "en";
}) {
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const hasMasterRating = data.bands.length > 0;
  const ja = locale === "ja";
  const summary = (record: ReturnType<typeof recentMatchSummary>) =>
    `${formatWinRate(record.winRate)} (${record.wins}–${record.losses}; n=${record.matches})`;
  const statRow = (label: string, item: ReturnType<typeof recentMatchSummary>) => (
    <div className="insight-row">
      <span>{label}</span>
      <div className="insight-row-bar" aria-hidden="true">
        <i style={{ width: `${item.winRate ?? 0}%` }} />
      </div>
      <strong>{formatWinRate(item.winRate)}</strong>
      <small>
        {item.wins}–{item.losses} · n={item.matches}
      </small>
    </div>
  );
  const record = (items: NormalizedMatch[]) => recentMatchSummary(items, items.length);
  const days = ja
    ? ["日", "月", "火", "水", "木", "金", "土"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourLabels = Array.from({ length: 24 }, (_, hour) => String((hour + 6) % 24));
  const gameLabels = ja ? ["1試合目", "2試合目", "3試合目"] : ["Game 1", "Game 2", "Game 3"];
  return (
    <section className="insights-card ui-card">
      <h3 className="insights-title ui-title">
        {ja
          ? "詳細分析：ラウンド・対戦相手・時間帯"
          : "Detailed analysis: rounds, opponents and time"}
      </h3>
      <span className="insights-caption">
        {ja ? "絞込後 · 勝率は勝敗のみ" : "Filtered · decided games only"}
      </span>
      <div className="insights-grid">
        <section>
          <h4>{ja ? "ラウンド成績" : "Round record"}</h4>
          <div className="round-overview">
            <div>
              <span>{ja ? "取得率" : "Won"}</span>
              <strong>
                {formatWinRate(
                  data.rounds.won + data.rounds.lost
                    ? (data.rounds.won * 100) / (data.rounds.won + data.rounds.lost)
                    : null,
                )}
              </strong>
            </div>
            <div>
              <span>{ja ? "取得 / 喪失" : "Won / lost"}</span>
              <strong>
                {data.rounds.won}–{data.rounds.lost}
              </strong>
            </div>
            <div>
              <span>{ja ? "得失差" : "Difference"}</span>
              <strong>
                {data.rounds.won - data.rounds.lost >= 0 ? "+" : ""}
                {data.rounds.won - data.rounds.lost}
              </strong>
            </div>
          </div>
          <div className="round-bar" aria-hidden="true">
            <i style={{ flexGrow: data.rounds.won }} />
            <b style={{ flexGrow: data.rounds.lost }} />
          </div>
          <small>{ja ? "記録完備のラウンドのみ" : "Complete round records only"}</small>
        </section>
        <section>
          <h4>{ja ? "ラウンド先取と接戦" : "First round and close games"}</h4>
          {statRow(ja ? "先取" : "Won first", record(data.rounds.firstWon))}
          {statRow(ja ? "先取された" : "Lost first", record(data.rounds.firstLost))}
          {statRow(
            ja ? "3ラウンド接戦（推定）" : "Three-round close games (estimated)",
            record(data.rounds.deciding),
          )}
        </section>
        <section>
          <h4>{ja ? "相手MR" : "Opponent MR"}</h4>
          {hasMasterRating ? (
            <>
              {data.bands.map(({ band, record: item }) => (
                <div key={band}>{statRow(`${band}–${band + 99}`, item)}</div>
              ))}
              {(ja
                ? ["相手が50以上低い", "差±49", "相手が50以上高い"]
                : ["Opponent −50 or less", "Within ±49", "Opponent +50 or more"]
              ).map((label, i) => (
                <div key={label}>{statRow(label, data.relative[i])}</div>
              ))}
              <small>{ja ? "記録時点は未検証" : "Recorded timing unverified"}</small>
            </>
          ) : (
            <small>
              {ja
                ? "絞込対象にMRが記録されたランクマッチがありません"
                : "No ranked matches with a recorded MR in this filter"}
            </small>
          )}
        </section>
        <section>
          <h4>{ja ? "対面：遭遇数と勝率" : "Matchups: frequency and win rate"}</h4>
          <svg
            className="insights-scatter"
            viewBox="0 0 400 160"
            role="img"
            aria-label={
              ja ? "横軸は勝率、縦軸は対戦数" : "Horizontal axis: win rate; vertical axis: matches"
            }
          >
            <line x1="20" y1="140" x2="390" y2="140" stroke="#747b84" />
            <line x1="205" y1="10" x2="205" y2="140" stroke="#747b84" strokeDasharray="4 4" />
            {data.matchups
              .filter((item) => item.winRate !== null)
              .map((item) => (
                <circle
                  key={`${item.characterId}-${item.characterSlug}`}
                  cx={20 + (item.winRate ?? 0) * 3.7}
                  cy={
                    140 -
                    (item.matches / Math.max(1, ...data.matchups.map((entry) => entry.matches))) *
                      125
                  }
                  r="5"
                  fill="#c7ff4a"
                >
                  <title>
                    {item.characterName}: {summary(item)}
                  </title>
                </circle>
              ))}
          </svg>
          <small>
            {ja
              ? "勝率 → · 試合数 ↑ · 点にカーソルでキャラクター名 · 少数は参考値"
              : "Win rate → · games ↑ · hover a dot for the character · small samples are indicative"}
          </small>
        </section>
        <section>
          <h4>{ja ? "同じ相手との連戦（推定）" : "Consecutive games (estimated)"}</h4>
          {gameLabels.map((label, i) => (
            <div key={label}>{statRow(label, data.sessions[i])}</div>
          ))}
          <small>
            {ja
              ? "同一相手・モード、10分以内（欠落・キャラ変更は未考慮）"
              : "Same opponent/mode within 10 min; gaps and character changes ignored"}
          </small>
        </section>
      </div>
      <section className="insights-time">
        <h4>
          {ja ? "曜日・時間帯別の勝率" : "Win rate by weekday and hour"}{" "}
          <span className="ui-note">
            {ja ? "（日本時間・6時始まり）" : "(Japan time · from 06:00)"}
          </span>
        </h4>
        <span className="ui-note">
          {ja
            ? "勝率 · 対戦数（薄色：勝敗判明5戦未満）"
            : "Win rate · games (muted: fewer than 5 decided)"}
        </span>
        <div className="insights-scroll">
          <table>
            <thead>
              <tr>
                <th>{ja ? "曜日" : "Day"}</th>
                {hourLabels.map((hour) => (
                  <th key={hour}>{hour}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, dayIndex) => (
                <tr key={day}>
                  <th>{day}</th>
                  {hourLabels.map((hour) => {
                    const item = data.weekdays[dayIndex][Number(hour)];
                    return (
                      <td
                        key={hour}
                        className={item.wins + item.losses < 5 ? "heatmap-low-sample" : ""}
                        title={`${days[dayIndex]} ${hour}:00 · ${summary(item)} · ${ja ? "引分・不明" : "draw / unknown"}: ${item.draws + item.unknown}`}
                        style={{
                          backgroundColor:
                            item.winRate === null
                              ? undefined
                              : item.winRate >= 50
                                ? `rgba(199, 255, 74, ${0.12 + (item.winRate - 50) / 200})`
                                : `rgba(255, 118, 95, ${0.12 + (50 - item.winRate) / 200})`,
                        }}
                      >
                        {item.winRate === null ? "–" : `${Math.round(item.winRate)}%`}
                        {item.matches > 0 && (
                          <small>
                            {item.matches}
                            {ja ? "戦" : "g"}
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="hourly-chart-title">
          {ja ? "時間別勝率" : "Win rate by hour"}{" "}
          <span className="ui-note">{ja ? "（全曜日）" : "(all weekdays)"}</span>
        </h4>
        <div className="hourly-scroll">
          <ul
            className="hourly-chart"
            aria-label={ja ? "全曜日を合算した時間別勝率" : "Win rates by hour across all weekdays"}
          >
            {hourLabels.map((hour) => {
              const item = data.hours[Number(hour)];
              const lowSample = item.wins + item.losses < 10;
              return (
                <li
                  className={`hourly-column${lowSample ? " hourly-low-sample" : ""}`}
                  key={hour}
                  aria-label={`${hour}:00 · ${summary(item)}${lowSample ? (ja ? " · 参考不足" : " · small sample") : ""}`}
                >
                  <span className="hourly-value">
                    {item.winRate === null ? "–" : `${Math.round(item.winRate)}%`}
                  </span>
                  <div className="hourly-track">
                    <i style={{ height: `${item.winRate ?? 0}%` }} />
                  </div>
                  <strong>{hour}</strong>
                  <small>
                    {item.matches}
                    {ja ? "戦" : "g"}
                  </small>
                </li>
              );
            })}
          </ul>
        </div>
        <small className="ui-note">
          {ja ? "薄色：勝敗判明10戦未満" : "Muted: fewer than 10 decided games"}
        </small>
      </section>
    </section>
  );
}
