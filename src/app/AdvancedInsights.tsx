import { type ReactNode, useMemo } from "react";
import { getCharacterNameBySlug } from "../domain/buckler/characterNames";
import { getRoundDetails } from "../domain/buckler/roundResults";
import type { NormalizedMatch } from "../domain/buckler/types";
import { advancedInsights, DAY_START_HOUR } from "../domain/statistics/advancedInsights";
import { type RecordSummary, recentMatchSummary } from "../domain/statistics/aggregateMatches";
import {
  FINISH_METHOD_CODES,
  finishMethodBreakdown,
  frequentOpponents,
  leaguePointDifferenceRecords,
  opponentInputTypeRecords,
  rankedSetBreakdown,
  sessionPositionPoints,
  sessionTrend,
  smoothedWinRates,
} from "../domain/statistics/matchPatterns";
import { CATEGORICAL_COLORS, DonutChart, formatShare, OTHER_COLOR } from "./DonutChart";
import { formatWinRate } from "./format";
import { MatchupScatter } from "./MatchupScatter";
import { SessionTrendChart } from "./SessionTrendChart";
import { WinRateColumns } from "./WinRateColumns";

type Locale = "ja" | "en";

function summaryText(record: RecordSummary): string {
  return `${formatWinRate(record.winRate)} (${record.wins}–${record.losses}; n=${record.matches})`;
}

function StatRow({ label, item }: { label: ReactNode; item: RecordSummary }) {
  return (
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
}

function Tag({ children }: { children: ReactNode }) {
  return <small className="heading-tag">{children}</small>;
}

function InsightsCard({
  title,
  locale,
  children,
}: {
  title: string;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <section className="insights-card ui-card">
      <h3 className="insights-title ui-title">{title}</h3>
      <span className="insights-caption">
        {locale === "ja" ? "絞込後 · 勝率は勝敗のみ" : "Filtered · decided games only"}
      </span>
      {children}
    </section>
  );
}

/** When the subject plays: weekday and hour, position in a session, and ranked sets. */
export function TimeInsights({ matches, locale }: { matches: NormalizedMatch[]; locale: Locale }) {
  const ja = locale === "ja";
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const sessionPoints = useMemo(() => sessionPositionPoints(matches), [matches]);
  const sets = useMemo(() => rankedSetBreakdown(matches), [matches]);
  const days = ja
    ? ["日", "月", "火", "水", "木", "金", "土"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Rows start on Monday; getUTCDay() numbers Sunday as 0.
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  // Hours after midnight stay on the previous day's row, so they read as 24, 25, ...
  const hours = Array.from({ length: 24 }, (_, offset) => {
    const hour = (offset + DAY_START_HOUR) % 24;
    return {
      hour,
      label: String(offset + DAY_START_HOUR),
      clock: `${String(hour).padStart(2, "0")}:00`,
      afterMidnight: hour === 0,
    };
  });
  const setTotal = sets.twoWins + sets.split + sets.twoLosses + sets.singleGame + sets.other;
  const setSegments = [
    { key: "two-wins", label: ja ? "2勝" : "Won both", value: sets.twoWins, color: "var(--win)" },
    {
      key: "split",
      label: ja ? "1勝1敗" : "Split",
      value: sets.split,
      color: "var(--neutral-data)",
    },
    {
      key: "two-losses",
      label: ja ? "2敗" : "Lost both",
      value: sets.twoLosses,
      color: "var(--loss)",
    },
    {
      key: "single",
      label: ja ? "1戦で終了" : "One game only",
      value: sets.singleGame,
      color: "#30353d",
    },
    ...(sets.other
      ? [
          {
            key: "other",
            label: ja ? "引分・不明を含む" : "With draw / unknown",
            value: sets.other,
            color: OTHER_COLOR,
          },
        ]
      : []),
  ].map((segment) => ({
    ...segment,
    figure: `${formatShare(segment.value, setTotal)} (${segment.value})`,
  }));
  return (
    <InsightsCard title={ja ? "時間帯と連続プレイ" : "Time and sessions"} locale={locale}>
      <section className="insights-time">
        <h4>
          {ja ? "曜日・時間帯別の勝率" : "Win rate by weekday and hour"}
          <Tag>
            {ja
              ? `日本時間・月曜始まり・${DAY_START_HOUR}時始まり、24〜${DAY_START_HOUR + 23}時は翌0〜${DAY_START_HOUR - 1}時`
              : `Japan time · Monday first · rows run ${DAY_START_HOUR}:00 to ${DAY_START_HOUR + 23}:59; 24+ is past midnight`}
          </Tag>
        </h4>
        <span className="ui-note">
          {ja
            ? "勝率 · 対戦数 · 薄色：勝敗判明5戦未満"
            : "Win rate · games · muted: fewer than 5 decided"}
        </span>
        <div className="insights-scroll">
          <table>
            <thead>
              <tr>
                <th>{ja ? "曜日" : "Day"}</th>
                {hours.map(({ hour, label, clock, afterMidnight }) => (
                  <th
                    key={hour}
                    className={afterMidnight ? "is-after-midnight" : undefined}
                    title={clock}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekdayOrder.map((dayIndex) => (
                <tr key={dayIndex}>
                  <th>{days[dayIndex]}</th>
                  {hours.map(({ hour, clock, afterMidnight }) => {
                    const item = data.weekdays[dayIndex][hour];
                    const className = [
                      item.wins + item.losses < 5 ? "heatmap-low-sample" : "",
                      afterMidnight ? "is-after-midnight" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={hour}
                        className={className || undefined}
                        title={`${days[dayIndex]}${hour < DAY_START_HOUR ? (ja ? "深夜" : " late night") : ""} ${clock} · ${summaryText(item)} · ${ja ? "引分・不明" : "draw / unknown"}: ${item.draws + item.unknown}`}
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
          {ja ? "時間別勝率" : "Win rate by hour"}
          <Tag>{ja ? "全曜日" : "all weekdays"}</Tag>
        </h4>
        <WinRateColumns
          ariaLabel={ja ? "全曜日を合算した時間別勝率" : "Win rates by hour across all weekdays"}
          matchUnit={ja ? "戦" : "g"}
          lowSampleThreshold={10}
          columns={hours.map(({ hour, label, clock, afterMidnight }) => {
            const item = data.hours[hour];
            return {
              key: String(hour),
              label,
              record: item,
              description: `${clock} · ${summaryText(item)}`,
              className: afterMidnight ? "is-after-midnight" : undefined,
            };
          })}
        />
        <small className="ui-note">
          {ja ? "薄色：勝敗判明10戦未満" : "Muted: fewer than 10 decided games"}
        </small>
      </section>
      <div className="share-pair">
        <section className="share-card">
          <h4 className="ui-subtitle">
            {ja ? "連続プレイ中の試合順" : "Position in a play session"}
            <Tag>{ja ? "推定" : "estimated"}</Tag>
          </h4>
          <SessionTrendChart
            points={sessionPoints}
            smoothed={smoothedWinRates(sessionPoints)}
            trend={sessionTrend(sessionPoints)}
            locale={locale}
          />
          <small className="ui-note">
            {ja
              ? "前の試合から30分以上空いたら新しいプレイとして数え直す · 点の大きさは試合数 · 線は前後3試合でならした勝率 · 40試合目以降は1点にまとめる"
              : "A gap of more than 30 minutes starts a new session · dot size shows games · the line averages three games on each side · games 40+ share one dot"}
          </small>
        </section>
        <section className="share-card">
          <h4 className="ui-subtitle">{ja ? "ランクマッチの連戦" : "Ranked sets"}</h4>
          <DonutChart
            segments={setSegments}
            centerValue={String(setTotal)}
            centerLabel={ja ? "セット" : "sets"}
            ariaLabel={setSegments
              .map((segment) => `${segment.label} ${segment.figure}`)
              .join(", ")}
          />
          <StatRow label={ja ? "1戦目" : "Game 1"} item={sets.firstGames} />
          <StatRow label={ja ? "2戦目" : "Game 2"} item={sets.secondGames} />
          <StatRow
            label={ja ? "1戦目に勝った後の2戦目" : "Game 2 after winning game 1"}
            item={sets.afterFirstWin}
          />
          <StatRow
            label={ja ? "1戦目に負けた後の2戦目" : "Game 2 after losing game 1"}
            item={sets.afterFirstLoss}
          />
          <small className="ui-note">
            {ja
              ? "ランクマッチは同じ相手と最大2戦なので、直前が同じ相手の1戦目なら2戦目として数える"
              : "Ranked sets are at most two games, so a game right after a first game against the same opponent is game 2"}
          </small>
        </section>
      </div>
    </InsightsCard>
  );
}

/** Who the subject plays against: matchups, strength, control type and repeat opponents. */
export function OpponentInsights({
  matches,
  locale,
}: {
  matches: NormalizedMatch[];
  locale: Locale;
}) {
  const ja = locale === "ja";
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const patterns = useMemo(
    () => ({
      leaguePoints: leaguePointDifferenceRecords(matches),
      inputTypes: opponentInputTypeRecords(matches),
      opponents: frequentOpponents(matches, 4, 10),
    }),
    [matches],
  );
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
            ? `不明${type === null ? "" : ` ${type}`}`
            : `Unknown${type === null ? "" : ` ${type}`}`;
  const lpLabel = (from: number | null, to: number | null) =>
    from === null
      ? ja
        ? `相手が${-(to ?? 0)}LP以上低い`
        : `Opponent ${-(to ?? 0)}+ LP lower`
      : to === null
        ? ja
          ? `相手が${from}LP以上高い`
          : `Opponent ${from}+ LP higher`
        : from < 0 && to < 0
          ? ja
            ? `相手が${-to}〜${-from}LP低い`
            : `Opponent ${-to}–${-from} LP lower`
          : from > 0
            ? ja
              ? `相手が${from}〜${to}LP高い`
              : `Opponent ${from}–${to} LP higher`
            : ja
              ? `差±${to}LP`
              : `Within ±${to} LP`;
  return (
    <InsightsCard title={ja ? "対戦相手" : "Opponents"} locale={locale}>
      <div className="insights-grid">
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
            {ja ? "相手との実力差" : "Strength difference"}
            <Tag>{ja ? "ランクマッチ" : "ranked"}</Tag>
          </h4>
          <h5 className="insights-subheading">{ja ? "LP差" : "LP difference"}</h5>
          {patterns.leaguePoints.map(({ from, to, record }) => {
            const label = lpLabel(from, to);
            return <StatRow key={label} label={label} item={record} />;
          })}
          <h5 className="insights-subheading">
            {ja ? "相手MR帯・MR差" : "Opponent MR and difference"}
          </h5>
          {data.bands.length ? (
            data.bands.map(({ band, record }) => (
              <StatRow key={band} label={`${band}–${band + 99}`} item={record} />
            ))
          ) : (
            <p>—</p>
          )}
          {(ja
            ? ["相手が50以上低い", "差±49", "相手が50以上高い"]
            : ["Opponent −50 or less", "Within ±49", "Opponent +50 or more"]
          ).map((label, i) => (
            <StatRow key={label} label={label} item={data.relative[i]} />
          ))}
          <small>
            {ja
              ? "LP差はマスターリーグ外で双方にLPがある試合 · LP・MRの記録時点は未検証"
              : "LP difference: both players outside Master League · when LP and MR are recorded is unverified"}
          </small>
        </section>
        <section>
          <h4>{ja ? "相手の操作タイプ" : "Opponent control type"}</h4>
          {patterns.inputTypes.length ? (
            patterns.inputTypes.map(({ inputType, record }) => (
              <StatRow
                key={inputType ?? "unknown"}
                label={inputTypeLabel(inputType)}
                item={record}
              />
            ))
          ) : (
            <p>—</p>
          )}
        </section>
        <section>
          <h4>
            {ja ? "よく当たる相手" : "Frequent opponents"}
            <Tag>
              {ja ? "同じキャラで4戦以上・上位10人" : "4+ games with one character · top 10"}
            </Tag>
          </h4>
          {patterns.opponents.length ? (
            patterns.opponents.map((opponent) => (
              <StatRow
                key={`${opponent.userCode}:${opponent.characterSlug}`}
                label={`${opponent.fighterId ?? opponent.userCode} · ${getCharacterNameBySlug(opponent.characterSlug, locale, opponent.characterName)}`}
                item={opponent.record}
              />
            ))
          ) : (
            <p>—</p>
          )}
        </section>
      </div>
    </InsightsCard>
  );
}

/** How games are decided: round record, first round, close games and finishing methods. */
export function RoundInsights({ matches, locale }: { matches: NormalizedMatch[]; locale: Locale }) {
  const ja = locale === "ja";
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const finishMethods = useMemo(() => finishMethodBreakdown(matches), [matches]);
  const record = (items: NormalizedMatch[]) => recentMatchSummary(items, items.length);
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
  return (
    <InsightsCard title={ja ? "ラウンドと決着" : "Rounds and finishes"} locale={locale}>
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
          <StatRow label={ja ? "先取" : "Won first"} item={record(data.rounds.firstWon)} />
          <StatRow label={ja ? "先取された" : "Lost first"} item={record(data.rounds.firstLost)} />
          <StatRow
            label={
              <>
                {ja ? "3ラウンド接戦" : "Three-round close games"}
                <Tag>{ja ? "推定" : "estimated"}</Tag>
              </>
            }
            item={record(data.rounds.deciding)}
          />
        </section>
      </div>
      <div className="share-pair">
        {finishDonut(finishMethods.won, ja ? "取ったラウンドの決着方法" : "How you won rounds")}
        {finishDonut(finishMethods.lost, ja ? "落としたラウンドの決着方法" : "How you lost rounds")}
      </div>
    </InsightsCard>
  );
}
