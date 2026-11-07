import { getCharacterNameBySlug } from "../domain/buckler/characterNames";
import type { CharacterRecord } from "../domain/statistics/aggregateMatches";
import { matchupHighlights } from "../domain/statistics/matchupPriorities";
import { formatWinRate } from "./format";

const WIDTH = 760;
const HEIGHT = 300;
const LEFT = 56;
const RIGHT = 744;
const TOP = 16;
const BOTTOM = 252;

function niceMax(value: number): number {
  const step = Math.max(1, 10 ** Math.floor(Math.log10(Math.max(1, value))) / 2);
  return Math.ceil(value / step) * step;
}

/** Opponent characters by win rate (x) and matches (y), naming the two weakest matchups. */
export function MatchupScatter({
  records,
  locale,
}: {
  records: CharacterRecord[];
  locale: "ja" | "en";
}) {
  const ja = locale === "ja";
  const shown = records.filter((record) => record.winRate !== null);
  const maxMatches = niceMax(Math.max(1, ...shown.map((record) => record.matches)));
  const x = (rate: number) => LEFT + (rate / 100) * (RIGHT - LEFT);
  const y = (matches: number) => BOTTOM - (matches / maxMatches) * (BOTTOM - TOP);
  const name = (record: CharacterRecord) =>
    getCharacterNameBySlug(record.characterSlug, locale, record.characterName);
  const highlights = matchupHighlights(records);
  const callouts = [
    { record: highlights.lowestWinRate, tag: ja ? "最低勝率" : "Lowest win rate" },
    { record: highlights.mostPlayedLosing, tag: ja ? "負け越し最多対戦" : "Most played losing" },
  ].filter(
    (item, index, all): item is { record: CharacterRecord; tag: string } =>
      item.record !== undefined && all.findIndex((other) => other.record === item.record) === index,
  );
  const key = (record: CharacterRecord) => `${record.characterId}-${record.characterSlug}`;
  return (
    <svg
      className="matchup-scatter"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={
        ja
          ? `相手キャラ別の勝率と対戦数。${callouts.map((item) => `${item.tag}：${name(item.record)} ${formatWinRate(item.record.winRate)}、${item.record.matches}戦`).join("。")}`
          : `Win rate and matches by opponent character. ${callouts.map((item) => `${item.tag}: ${name(item.record)} ${formatWinRate(item.record.winRate)}, ${item.record.matches} matches`).join(". ")}`
      }
    >
      {[0, 25, 50, 75, 100].map((rate) => (
        <g key={`x${rate}`}>
          <line
            className={rate === 50 ? "matchup-scatter-even" : "matchup-scatter-grid"}
            x1={x(rate)}
            x2={x(rate)}
            y1={TOP}
            y2={BOTTOM}
          />
          <text x={x(rate)} y={BOTTOM + 18} textAnchor="middle">
            {rate}%
          </text>
        </g>
      ))}
      {[0, maxMatches / 2, maxMatches].map((matches) => (
        <g key={`y${matches}`}>
          <line
            className="matchup-scatter-grid"
            x1={LEFT}
            x2={RIGHT}
            y1={y(matches)}
            y2={y(matches)}
          />
          <text x={LEFT - 8} y={y(matches) + 4} textAnchor="end">
            {matches}
          </text>
        </g>
      ))}
      <text className="matchup-scatter-axis" x={RIGHT} y={HEIGHT - 4} textAnchor="end">
        {ja ? "勝率 →" : "Win rate →"}
      </text>
      <text className="matchup-scatter-axis" x={LEFT} y={TOP - 4} textAnchor="start">
        {ja ? "↑ 対戦数" : "↑ Matches"}
      </text>
      {shown.map((record) => (
        <circle
          key={key(record)}
          className={`matchup-scatter-dot${(record.winRate ?? 0) < 50 ? " is-losing" : ""}`}
          cx={x(record.winRate ?? 0)}
          cy={y(record.matches)}
          r="6"
        >
          <title>
            {name(record)}: {formatWinRate(record.winRate)} ({record.wins}–{record.losses},{" "}
            {record.matches}
            {ja ? "戦" : " matches"})
          </title>
        </circle>
      ))}
      {callouts.map(({ record, tag }) => {
        const cx = x(record.winRate ?? 0);
        const cy = y(record.matches);
        const anchorEnd = cx > (LEFT + RIGHT) / 2;
        const tx = cx + (anchorEnd ? -12 : 12);
        return (
          <g key={`callout-${key(record)}`} className="matchup-scatter-callout">
            <circle cx={cx} cy={cy} r="10" />
            <text x={tx} y={cy - 2} textAnchor={anchorEnd ? "end" : "start"}>
              {name(record)} {formatWinRate(record.winRate)} · {record.matches}
              {ja ? "戦" : " matches"}
            </text>
            <text
              className="matchup-scatter-tag"
              x={tx}
              y={cy + 13}
              textAnchor={anchorEnd ? "end" : "start"}
            >
              {tag}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
