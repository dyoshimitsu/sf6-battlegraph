import { type ReactNode, useMemo } from "react";
import { getCharacterNameBySlug } from "../domain/buckler/characterNames";
import { getRoundDetails } from "../domain/buckler/roundResults";
import type { NormalizedMatch } from "../domain/buckler/types";
import { advancedInsights } from "../domain/statistics/advancedInsights";
import { recentMatchSummary } from "../domain/statistics/aggregateMatches";
import {
  FINISH_METHOD_CODES,
  finishMethodBreakdown,
  frequentOpponents,
  opponentInputTypeRecords,
  sessionPositionPoints,
  sessionTrend,
  smoothedWinRates,
} from "../domain/statistics/matchPatterns";
import { CATEGORICAL_COLORS, DonutChart, formatShare } from "./DonutChart";
import { formatWinRate } from "./format";
import { MatchupScatter } from "./MatchupScatter";
import { SessionTrendChart } from "./SessionTrendChart";
import { WinRateColumns } from "./WinRateColumns";

export function AdvancedInsights({
  matches,
  locale,
}: {
  matches: NormalizedMatch[];
  locale: "ja" | "en";
}) {
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const patterns = useMemo(
    () => ({
      sessionPositions: sessionPositionPoints(matches),
      finishMethods: finishMethodBreakdown(matches),
      inputTypes: opponentInputTypeRecords(matches),
      opponents: frequentOpponents(matches, 4, 10),
    }),
    [matches],
  );
  const ja = locale === "ja";
  const inputTypeLabel = (type: number | null) =>
    type === 0
      ? ja
        ? "クラシック"
        : "Classic"
      : type === 1
        ? ja
          ? "モダン"
          : "Modern"
        : type === 2
          ? ja
            ? "ダイナミック"
            : "Dynamic"
          : ja
            ? `不明${type === null ? "" : ` (${type})`}`
            : `Unknown${type === null ? "" : ` (${type})`}`;
  const finishDonut = (counts: Map<number, number>, title: string) => {
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    const codes = [
      ...FINISH_METHOD_CODES,
      ...[...counts.keys()].filter(
        (code) => !(FINISH_METHOD_CODES as readonly number[]).includes(code),
      ),
    ];
    const segments = codes.map((code, index) => {
      const [detail] = getRoundDetails([code], [0], locale);
      const value = counts.get(code) ?? 0;
      return {
        key: String(code),
        label: `${detail.method} · ${detail.description}`,
        value,
        color: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length],
        figure: `${formatShare(value, total)} (${value})`,
      };
    });
    const top = [...segments].sort((a, b) => b.value - a.value)[0];
    return (
      <section className="share-card">
        <h4 className="ui-subtitle">{title}</h4>
        <DonutChart
          segments={segments}
          centerValue={String(total)}
          centerLabel={
            total && top ? `${top.label.split(" · ")[0]} ${formatShare(top.value, total)}` : "—"
          }
          ariaLabel={`${title}: ${segments.map((segment) => `${segment.label} ${segment.figure}`).join(", ")}`}
        />
      </section>
    );
  };
  const summary = (record: ReturnType<typeof recentMatchSummary>) =>
    `${formatWinRate(record.winRate)} (${record.wins}–${record.losses}; n=${record.matches})`;
  const estimate = <small className="estimate-tag">{ja ? "推定" : "estimated"}</small>;
  const statRow = (label: ReactNode, item: ReturnType<typeof recentMatchSummary>) => (
    <div className="insight-row">
      <span>{label}</span>
      <div className="insight-row-bar" aria-hidden="true">
        <i
          className={item.winRate !== null && item.winRate < 50 ? "is-losing" : undefined}
          style={{ width: `${item.winRate ?? 0}%` }}
        />
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
        </section>
        <section>
          <h4>{ja ? "ラウンド先取と接戦" : "First round and close games"}</h4>
          {statRow(ja ? "先取" : "Won first", record(data.rounds.firstWon))}
          {statRow(ja ? "先取された" : "Lost first", record(data.rounds.firstLost))}
          {statRow(
            <>
              {ja ? "3ラウンド接戦" : "Three-round close games"}
              {estimate}
            </>,
            record(data.rounds.deciding),
          )}
        </section>
        <section>
          <h4>{ja ? "相手MR帯・MR差" : "Opponent MR and difference"}</h4>
          {data.bands.length ? (
            data.bands.map(({ band, record: item }) => (
              <div key={band}>{statRow(`${band}–${band + 99}`, item)}</div>
            ))
          ) : (
            <p>—</p>
          )}
          {(ja
            ? ["相手が50以上低い", "差±49", "相手が50以上高い"]
            : ["Opponent −50 or less", "Within ±49", "Opponent +50 or more"]
          ).map((label, i) => (
            <div key={label}>{statRow(label, data.relative[i])}</div>
          ))}
          <small>{ja ? "記録時点は未検証" : "Recorded timing unverified"}</small>
        </section>
        <section>
          <h4>
            {ja ? "相手キャラ別の対戦数と勝率" : "Matches and win rate by opponent character"}
          </h4>
          <MatchupScatter records={data.matchups} locale={locale} />
          <small>
            {ja
              ? "点にカーソルで詳細 · 名前付きは勝敗5戦以上で最低勝率のキャラと、負け越しで最も対戦数が多いキャラ"
              : "Hover a dot for details · labelled: lowest win rate with 5+ decided games, and the most played losing matchup"}
          </small>
        </section>
        <section>
          <h4>
            {ja ? "連続プレイ中の試合順" : "Position in a play session"}
            {estimate}
          </h4>
          <SessionTrendChart
            points={patterns.sessionPositions}
            smoothed={smoothedWinRates(patterns.sessionPositions)}
            trend={sessionTrend(patterns.sessionPositions)}
            locale={locale}
          />
          <small>
            {ja
              ? "前の試合から30分以上空いたら新しいプレイとして数え直す · 点の大きさは試合数 · 線は前後3試合でならした勝率 · 40試合目以降は1点にまとめる"
              : "A gap of more than 30 minutes starts a new session · dot size shows games · the line averages three games on each side · games 40+ share one dot"}
          </small>
        </section>
        <section>
          <h4>{ja ? "相手の操作タイプ" : "Opponent control type"}</h4>
          {patterns.inputTypes.length ? (
            patterns.inputTypes.map(({ inputType, record: item }) => (
              <div key={inputType ?? "unknown"}>{statRow(inputTypeLabel(inputType), item)}</div>
            ))
          ) : (
            <p>—</p>
          )}
        </section>
        <section>
          <h4>
            {ja
              ? "よく当たる相手（同じキャラで4戦以上・上位10人）"
              : "Frequent opponents (4+ games with one character, top 10)"}
          </h4>
          {patterns.opponents.length ? (
            patterns.opponents.map((opponent) => (
              <div key={`${opponent.userCode}:${opponent.characterSlug}`}>
                {statRow(
                  `${opponent.fighterId ?? opponent.userCode} · ${getCharacterNameBySlug(opponent.characterSlug, locale, opponent.characterName)}`,
                  opponent.record,
                )}
              </div>
            ))
          ) : (
            <p>—</p>
          )}
        </section>
        <section>
          <h4>
            {ja ? "同じ相手との連戦" : "Consecutive games"}
            {estimate}
          </h4>
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
      <div className="share-pair">
        {finishDonut(
          patterns.finishMethods.won,
          ja ? "取ったラウンドの決着方法" : "How you won rounds",
        )}
        {finishDonut(
          patterns.finishMethods.lost,
          ja ? "落としたラウンドの決着方法" : "How you lost rounds",
        )}
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
        <h4 className="rate-columns-title">
          {ja ? "時間別勝率" : "Win rate by hour"}{" "}
          <span className="ui-note">{ja ? "（全曜日）" : "(all weekdays)"}</span>
        </h4>
        <WinRateColumns
          ariaLabel={ja ? "全曜日を合算した時間別勝率" : "Win rates by hour across all weekdays"}
          matchUnit={ja ? "戦" : "g"}
          lowSampleThreshold={10}
          columns={hourLabels.map((hour) => {
            const item = data.hours[Number(hour)];
            return {
              key: hour,
              label: hour,
              record: item,
              description: `${hour}:00 · ${summary(item)}`,
            };
          })}
        />
        <small className="ui-note">
          {ja ? "薄色：勝敗判明10戦未満" : "Muted: fewer than 10 decided games"}
        </small>
      </section>
    </section>
  );
}
