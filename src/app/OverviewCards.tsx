import { getCharacterNameBySlug } from "../domain/buckler/characterNames";
import type { CharacterRecord, MatchStatistics } from "../domain/statistics/aggregateMatches";
import type { Translate } from "../i18n/useI18n";
import { CATEGORICAL_COLORS, DonutChart, formatShare, OTHER_COLOR } from "./DonutChart";
import { formatWinRate } from "./format";

const RECORD_COLORS = {
  win: "var(--win)",
  loss: "var(--loss)",
  other: "var(--neutral-data)",
} as const;
const MAX_CHARACTER_SEGMENTS = 6;

export function RecordBreakdownCard({
  statistics,
  t,
}: {
  statistics: MatchStatistics;
  t: Translate;
}) {
  const { overall, bySide } = statistics;
  const other = overall.draws + overall.unknown;
  return (
    <section className="overview-card ui-card" aria-label={t("recordBreakdown")}>
      <h3 className="ui-title">{t("recordBreakdown")}</h3>
      <DonutChart
        ariaLabel={`${t("winRate")} ${formatWinRate(overall.winRate)}`}
        centerValue={formatWinRate(overall.winRate)}
        centerLabel={t("winRate")}
        segments={[
          {
            key: "win",
            label: t("wins"),
            value: overall.wins,
            color: RECORD_COLORS.win,
            figure: String(overall.wins),
          },
          {
            key: "loss",
            label: t("losses"),
            value: overall.losses,
            color: RECORD_COLORS.loss,
            figure: String(overall.losses),
          },
          {
            key: "other",
            label: t("dailyOther"),
            value: other,
            color: RECORD_COLORS.other,
            figure: String(other),
          },
        ]}
      />
      <dl className="overview-sides">
        {bySide.map((record) => (
          <div key={record.side}>
            <dt>{t(record.side === 1 ? "playerOneWinRate" : "playerTwoWinRate")}</dt>
            <dd>
              <strong>{formatWinRate(record.winRate)}</strong>
              <small>{t("sideRecord", { wins: record.wins, matches: record.matches })}</small>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function characterKey(record: CharacterRecord): string {
  return record.characterId === null ? `slug:${record.characterSlug}` : `id:${record.characterId}`;
}

export function CharacterShareCard({
  records,
  colorOrder,
  locale,
  t,
}: {
  records: CharacterRecord[];
  /** Unfiltered records, so a character keeps its color when filters change. */
  colorOrder: CharacterRecord[];
  locale: "ja" | "en";
  t: Translate;
}) {
  const slots = new Map(colorOrder.map((record, index) => [characterKey(record), index]));
  const total = records.reduce((sum, record) => sum + record.matches, 0);
  const shown =
    records.length > MAX_CHARACTER_SEGMENTS
      ? records.slice(0, MAX_CHARACTER_SEGMENTS - 1)
      : records;
  const folded = records.slice(shown.length);
  const foldedMatches = folded.reduce((sum, record) => sum + record.matches, 0);
  const segments = shown.map((record) => {
    const slot = slots.get(characterKey(record));
    return {
      key: characterKey(record),
      label: getCharacterNameBySlug(record.characterSlug, locale, record.characterName),
      value: record.matches,
      color:
        slot !== undefined && slot < CATEGORICAL_COLORS.length
          ? CATEGORICAL_COLORS[slot]
          : OTHER_COLOR,
      figure: formatShare(record.matches, total),
      detail: `${t("recordLine", { matches: record.matches, wins: record.wins, losses: record.losses })} · ${formatWinRate(record.winRate)}`,
    };
  });
  if (folded.length)
    segments.push({
      key: "other",
      label: t("otherCharacters"),
      value: foldedMatches,
      color: OTHER_COLOR,
      figure: formatShare(foldedMatches, total),
      detail: t("recordLine", {
        matches: foldedMatches,
        wins: folded.reduce((sum, record) => sum + record.wins, 0),
        losses: folded.reduce((sum, record) => sum + record.losses, 0),
      }),
    });
  const lead = records[0];
  return (
    <section className="overview-card ui-card" aria-label={t("yourCharacterRecords")}>
      <h3 className="ui-title">{t("yourCharacterRecords")}</h3>
      <span className="ui-caption">{t("characterShareNote")}</span>
      <DonutChart
        ariaLabel={segments.map((segment) => `${segment.label} ${segment.figure}`).join(", ")}
        centerValue={String(total)}
        centerLabel={
          lead
            ? `${getCharacterNameBySlug(lead.characterSlug, locale, lead.characterName)} ${formatShare(lead.matches, total)}`
            : "—"
        }
        segments={segments}
      />
    </section>
  );
}
