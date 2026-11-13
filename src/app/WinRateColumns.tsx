import type { CSSProperties, ReactNode } from "react";
import type { RecordSummary } from "../domain/statistics/aggregateMatches";

export interface WinRateColumn {
  key: string;
  label: string;
  record: RecordSummary;
  /** Text read by assistive technology for this column. */
  description: string;
  /** Optional extra figures under the match count. */
  note?: ReactNode;
  /** Extra class for the column, e.g. to mark a boundary. */
  className?: string;
}

/** Vertical win-rate bars with the match count under each label. */
export function WinRateColumns({
  columns,
  ariaLabel,
  matchUnit,
  lowSampleThreshold,
  minColumnWidth = 42,
}: {
  columns: WinRateColumn[];
  ariaLabel: string;
  matchUnit: string;
  /** Columns with fewer decided games than this are muted. */
  lowSampleThreshold: number;
  minColumnWidth?: number;
}) {
  const style = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(${minColumnWidth}px, 1fr))`,
    minWidth: `${columns.length * (minColumnWidth + 4)}px`,
  } satisfies CSSProperties;
  return (
    <div className="rate-columns-scroll">
      <ul className="rate-columns" aria-label={ariaLabel} style={style}>
        {columns.map(({ key, label, record, description, note, className }) => {
          const lowSample = record.wins + record.losses < lowSampleThreshold;
          return (
            <li
              className={`rate-column${lowSample ? " rate-column--low-sample" : ""}${className ? ` ${className}` : ""}`}
              key={key}
              aria-label={description}
            >
              <span>{record.winRate === null ? "–" : `${Math.round(record.winRate)}%`}</span>
              <div className="rate-column-track">
                <i
                  className={
                    record.winRate !== null && record.winRate < 50 ? "is-losing" : "is-winning"
                  }
                  style={{ height: `${record.winRate ?? 0}%` }}
                />
              </div>
              <strong>{label}</strong>
              <small>
                {record.matches}
                {matchUnit}
              </small>
              {note}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
