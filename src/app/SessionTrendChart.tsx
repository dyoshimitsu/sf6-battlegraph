import type { SessionPositionPoint, SessionTrend } from "../domain/statistics/matchPatterns";
import { formatWinRate } from "./format";

const LEFT = 48;
const RIGHT = 744;
const TOP = 12;
const BOTTOM = 220;

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

/** Win rate by game number within a play session, with a smoothed line and the overall slope. */
export function SessionTrendChart({
  points,
  smoothed,
  trend,
  locale,
}: {
  points: SessionPositionPoint[];
  smoothed: (number | null)[];
  trend: SessionTrend | null;
  locale: "ja" | "en";
}) {
  const ja = locale === "ja";
  const last = points.length;
  const x = (position: number) => LEFT + ((position - 1) * (RIGHT - LEFT)) / Math.max(1, last - 1);
  const y = (rate: number) => BOTTOM - (rate / 100) * (BOTTOM - TOP);
  const maxGames = Math.max(1, ...points.map((point) => point.record.wins + point.record.losses));
  const line = smoothed
    .map((rate, index) => (rate === null ? null : `${x(index + 1)},${y(rate)}`))
    .filter((value): value is string => value !== null)
    .join(" ");
  const label = (point: SessionPositionPoint) =>
    point.openEnded
      ? ja
        ? `${point.position}試合目以降`
        : `Game ${point.position}+`
      : ja
        ? `${point.position}試合目`
        : `Game ${point.position}`;
  const meaningful = trend !== null && Math.abs(trend.perTenGames) >= 2 * trend.standardError;
  return (
    <div className="session-trend">
      <svg
        viewBox="0 0 760 248"
        role="img"
        aria-label={
          ja
            ? "連続プレイ中の試合順ごとの勝率。点の大きさは試合数、線は前後3試合でならした勝率"
            : "Win rate by game number in a session. Dot size shows games; the line averages three games on each side"
        }
      >
        {[0, 50, 100].map((rate) => (
          <g key={rate}>
            <line className="session-trend-grid" x1={LEFT} x2={RIGHT} y1={y(rate)} y2={y(rate)} />
            <text x={LEFT - 6} y={y(rate) + 3} textAnchor="end">
              {rate}%
            </text>
          </g>
        ))}
        {points.map((point) => {
          const games = point.record.wins + point.record.losses;
          if (!games || point.record.winRate === null) return null;
          return (
            <circle
              key={point.position}
              cx={x(point.position)}
              cy={y(point.record.winRate)}
              r={3 + 9 * Math.sqrt(games / maxGames)}
              className={`session-trend-dot${point.record.winRate < 50 ? " is-losing" : ""}${games < 5 ? " is-low-sample" : ""}`}
            >
              <title>
                {label(point)}: {formatWinRate(point.record.winRate)} ({point.record.wins}–
                {point.record.losses})
              </title>
            </circle>
          );
        })}
        {line && <polyline className="session-trend-line" points={line} />}
        {[1, 10, 20, 30, last].map((position) => (
          <text key={position} x={x(position)} y={242} textAnchor="middle">
            {position === last ? `${position}+` : position}
          </text>
        ))}
      </svg>
      <p className="session-trend-summary">
        {trend === null ? (
          "—"
        ) : (
          <>
            <strong>
              {ja
                ? `10試合ごとに ${signed(trend.perTenGames)}pt`
                : `${signed(trend.perTenGames)}pt per 10 games`}
            </strong>
            <span>
              {ja ? "誤差" : "error"} ±{trend.standardError.toFixed(1)}pt ·{" "}
              {meaningful
                ? trend.perTenGames < 0
                  ? ja
                    ? "続けるほど勝率が下がる傾向"
                    : "win rate falls as the session goes on"
                  : ja
                    ? "続けるほど勝率が上がる傾向"
                    : "win rate rises as the session goes on"
                : ja
                  ? "はっきりした傾向はなし"
                  : "no clear trend"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
