export interface HabitComparisonRow {
  key: string;
  label: string;
  /** Swatch shown when the row matches a chart segment. */
  color?: string;
  value?: number;
  reference?: number;
  leaders?: number;
}

function format(value: number | undefined, percent: boolean): string {
  if (value === undefined) return "—";
  return percent ? `${(value * 100).toFixed(1)}%` : value.toFixed(value >= 10 ? 1 : 2);
}

function signed(value: number, percent: boolean): string {
  const scaled = percent ? value * 100 : value;
  const digits = percent ? 1 : Math.abs(scaled) >= 10 ? 1 : 2;
  if (Math.abs(scaled) < 0.5 * 10 ** -digits) return "±0";
  return `${scaled >= 0 ? "+" : "−"}${Math.abs(scaled).toFixed(digits)}${percent ? "pt" : ""}`;
}

/**
 * Own playstyle values beside a reference (previous capture or best window) and the ranking
 * leaders' average. The bar shows the own value; the line marks the leaders on the same scale.
 */
export function HabitComparisonTable({
  rows,
  percent,
  referenceLabel,
  leadersLabel,
  locale,
}: {
  rows: HabitComparisonRow[];
  percent: boolean;
  referenceLabel: string;
  leadersLabel?: string;
  locale: "ja" | "en";
}) {
  const ja = locale === "ja";
  const showLeaders = leadersLabel !== undefined;
  return (
    <table className="habit-table">
      <thead>
        <tr>
          <th scope="col">{ja ? "項目" : "Item"}</th>
          <th scope="col">{ja ? "自分" : "You"}</th>
          <th scope="col">{referenceLabel}</th>
          {showLeaders && <th scope="col">{leadersLabel}</th>}
          {showLeaders && <th scope="col">{ja ? "上位との差" : "vs top"}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const scale = Math.max(row.value ?? 0, row.leaders ?? 0, row.reference ?? 0) * 1.15 || 1;
          const difference =
            row.value !== undefined && row.leaders !== undefined
              ? row.value - row.leaders
              : undefined;
          return (
            <tr key={row.key}>
              <th scope="row">
                {row.color && <i style={{ background: row.color }} aria-hidden="true" />}
                {row.label}
              </th>
              <td className="habit-table-own">{format(row.value, percent)}</td>
              <td>{format(row.reference, percent)}</td>
              {showLeaders && <td>{format(row.leaders, percent)}</td>}
              {showLeaders && (
                <td className="habit-table-diff">
                  <span>{difference === undefined ? "—" : signed(difference, percent)}</span>
                  {row.value !== undefined && row.leaders !== undefined && (
                    <span className="habit-table-bar" aria-hidden="true">
                      <i style={{ width: `${(row.value / scale) * 100}%` }} />
                      <b style={{ left: `${(row.leaders / scale) * 100}%` }} />
                    </span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
