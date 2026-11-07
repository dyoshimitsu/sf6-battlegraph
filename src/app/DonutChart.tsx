import type { ReactNode } from "react";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Text shown beside the label in the legend, such as a count or share. */
  figure: string;
  /** Optional secondary line in the legend. */
  detail?: ReactNode;
}

const RADIUS = 48;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Surface-colored gap between adjacent segments, in SVG units along the ring.
const GAP = 1.6;

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const visible = segments.filter((segment) => segment.value > 0);
  const gap = visible.length > 1 ? GAP : 0;
  let offset = 0;
  const arcs = visible.map((segment) => {
    const length = (segment.value / total) * CIRCUMFERENCE;
    const arc = {
      segment,
      dash: `${Math.max(0, length - gap)} ${CIRCUMFERENCE - Math.max(0, length - gap)}`,
      offset: -offset,
    };
    offset += length;
    return arc;
  });
  return (
    <div className="donut">
      <div className="donut-figure">
        <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel}>
          <circle className="donut-track" cx="60" cy="60" r={RADIUS} strokeWidth={STROKE} />
          <g transform="rotate(-90 60 60)">
            {arcs.map(({ segment, dash, offset: dashOffset }) => (
              <circle
                key={segment.key}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                style={{ stroke: segment.color }}
                strokeWidth={STROKE}
                strokeDasharray={dash}
                strokeDashoffset={dashOffset}
              >
                <title>
                  {segment.label}: {segment.figure}
                </title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="donut-center" aria-hidden="true">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <i style={{ background: segment.color }} aria-hidden="true" />
            <span className="donut-legend-label">{segment.label}</span>
            <strong>{segment.figure}</strong>
            {segment.detail && <small>{segment.detail}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Categorical slots validated against the dark card surface (#15181d). */
export const CATEGORICAL_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
] as const;

export const OTHER_COLOR = "#5b616b";

export function formatShare(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
}
