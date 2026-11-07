import { getCharacterName, getCharacterNameBySlug } from "../domain/buckler/characterNames";
import type { BucklerBundlePreview } from "../domain/buckler/types";
import type { CharacterRecord } from "../domain/statistics/aggregateMatches";
import { formatWinRate } from "./format";

export function CharacterPanel({
  eyebrow,
  title,
  records,
  matches,
  side,
  locale,
  recordLine,
  matchupSearchLabel,
  priorityMatchups,
  priorityTitle,
  priorityDescription,
  priorityEmpty,
}: {
  eyebrow: string;
  title: string;
  records: CharacterRecord[];
  matches: BucklerBundlePreview["matches"];
  side: "subject" | "opponent";
  locale: "ja" | "en";
  recordLine: (key: "recordLine", values: Record<string, number>) => string;
  matchupSearchLabel?: string;
  priorityMatchups?: CharacterRecord[];
  priorityTitle?: string;
  priorityDescription?: string;
  priorityEmpty?: string;
}) {
  return (
    <article className="analysis-card character-panel is-roster ui-card">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="ui-title">{title}</h3>
      {side === "opponent" && priorityMatchups && (
        <div className="matchup-priorities">
          <strong>{priorityTitle}</strong>
          <span>{priorityDescription}</span>
          {priorityMatchups.length > 0 ? (
            <div className="matchup-priority-list">
              {priorityMatchups.map((record) => (
                <span key={`${record.characterId}-${record.characterSlug}`}>
                  {getCharacterNameBySlug(record.characterSlug, locale, record.characterName)} ·{" "}
                  {record.losses - record.wins}
                  {locale === "ja" ? "敗超過" : " net losses"} · {formatWinRate(record.winRate)}
                </span>
              ))}
            </div>
          ) : (
            <span>{priorityEmpty}</span>
          )}
        </div>
      )}
      <div className="character-records">
        {records.map((record) => {
          const sample = matches.find(
            (match) =>
              (match[side].playing_character_id ?? match[side].character_id) === record.characterId,
          );
          const winRate = record.winRate ?? 0;
          const opponentColor =
            side === "opponent" && record.winRate !== null
              ? `hsl(${winRate >= 50 ? 145 : 5} 60% ${25 + (Math.abs(winRate - 50) / 50) * 17}%)`
              : undefined;
          const characterName = sample
            ? getCharacterName(sample[side], locale)
            : record.characterName;
          const japaneseName = getCharacterNameBySlug(
            record.characterSlug,
            "ja",
            sample?.[side].playing_character_name ?? sample?.[side].character_name,
          );
          const searchUrl = `https://www.youtube.com/results?${new URLSearchParams({ search_query: `スト6 ${japaneseName} 対策` })}`;
          return (
            <div key={`${record.characterId}-${record.characterSlug}`}>
              <span className="character-name">{characterName}</span>
              <strong className="match-count">
                {record.matches}
                <small>{locale === "ja" ? "戦" : " matches"}</small>
              </strong>
              <small className="record-line">
                <span>
                  {recordLine("recordLine", {
                    matches: record.matches,
                    wins: record.wins,
                    losses: record.losses,
                  })}
                </span>
                {side === "opponent" && matchupSearchLabel && (
                  <a
                    className="matchup-search"
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={matchupSearchLabel}
                    aria-label={`${characterName}: ${matchupSearchLabel}`}
                  >
                    <svg viewBox="0 0 24 24" role="img">
                      <title>{matchupSearchLabel}</title>
                      <path
                        fill="currentColor"
                        d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A25.7 25.7 0 0 0 2 12a25.7 25.7 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A25.7 25.7 0 0 0 22 12a25.7 25.7 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"
                      />
                    </svg>
                  </a>
                )}
              </small>
              <div className={`win-rate${side === "opponent" ? " opponent-win-rate" : ""}`}>
                <i style={{ width: `${winRate}%`, background: opponentColor }} />
                <span>{formatWinRate(winRate)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
