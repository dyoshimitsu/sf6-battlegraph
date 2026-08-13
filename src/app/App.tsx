import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { parseCollectorImport } from "../domain/buckler/parseCollectorBundle";
import { BucklerValidationError, type BucklerBundlePreview } from "../domain/buckler/types";
import { aggregateMatches, filterMatches } from "../domain/statistics/aggregateMatches";
import { useI18n } from "../i18n/useI18n";

const INITIAL_USER_CODE = 1134991793;

interface ImportedBundle {
  fileName: string;
  fileSize: number;
  preview: BucklerBundlePreview;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatWinRate(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function playerCharacterName(player: BucklerBundlePreview["matches"][number]["subject"]): string {
  return player.playing_character_name ?? player.character_name ?? "Unknown";
}

export function App() {
  const { locale, setLocale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mode, setMode] = useState("");
  const [subjectCharacterId, setSubjectCharacterId] = useState("");
  const [opponentCharacterId, setOpponentCharacterId] = useState("");

  const dateTimeFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
  }), [locale]);
  const formatTimestamp = (timestamp?: number) => timestamp === undefined ? "—" : dateTimeFormatter.format(new Date(timestamp * 1000));

  const readiness = [
    { label: t("validateJson"), done: imported !== null },
    { label: t("mergePages"), done: imported !== null && !imported.preview.isSinglePage },
    { label: t("firestoreSync"), done: false },
    { label: t("chartDisplay"), done: false },
  ];
  const filteredMatches = useMemo(() => filterMatches(imported?.preview.matches ?? [], {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    mode: mode ? mode as BucklerBundlePreview["matches"][number]["mode"] : undefined,
    subjectCharacterId: subjectCharacterId ? Number(subjectCharacterId) : undefined,
    opponentCharacterId: opponentCharacterId ? Number(opponentCharacterId) : undefined,
  }), [fromDate, imported, mode, opponentCharacterId, subjectCharacterId, toDate]);
  const statistics = useMemo(() => aggregateMatches(filteredMatches), [filteredMatches]);
  const allStatistics = useMemo(() => aggregateMatches(imported?.preview.matches ?? []), [imported]);

  async function importFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      const preview = parseCollectorImport(JSON.parse(await file.text()) as unknown, INITIAL_USER_CODE);
      setImported({ fileName: file.name, fileSize: file.size, preview });
    } catch (cause) {
      setImported(null);
      if (cause instanceof SyntaxError) setError(t("errorInvalidJson"));
      else if (cause instanceof BucklerValidationError) setError(cause.message);
      else setError(t("errorUnexpected"));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void importFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function resetFilters() {
    setFromDate(""); setToDate(""); setMode(""); setSubjectCharacterId(""); setOpponentCharacterId("");
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top"><span className="brand-mark">B</span><span><strong>{t("appName")}</strong><small>{t("appTagline")}</small></span></a>
        <div className="header-actions">
          <span className="status-pill"><i /> {t("localPreview")}</span>
          <div className="language-switch" aria-label="Language">
            <button className={locale === "ja" ? "active" : ""} onClick={() => setLocale("ja")}>JP</button>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy"><p className="eyebrow">{t("heroEyebrow")}</p><h1>{t("heroTitle").split("\n").map((line, i) => <span key={line}>{line}{i === 0 && <br />}</span>)}</h1><p className="lead">{t("heroLead")}</p></div>
          <div className="hero-stat"><span>100</span><b>+</b><small>{t("archiveLabel")}</small></div>
        </section>

        <section className="workspace">
          <div className="section-heading"><div><p className="eyebrow">{t("importEyebrow")}</p><h2>{t("importTitle")}</h2></div><p>{t("userCode")} <strong>{INITIAL_USER_CODE}</strong></p></div>
          <div className="workspace-grid">
            <div className={`drop-zone ${isDragging ? "is-dragging" : ""}`} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDragOver={(e) => e.preventDefault()} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); void importFile(e.dataTransfer.files[0]); }}>
              <div className="drop-symbol"><span>↓</span></div><h3>{t("dropTitle")}</h3><p>{t("dropDescription")}</p>
              <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>{t("selectFile")}</button>
              <a className={`collector-link ${import.meta.env.DEV ? "is-disabled" : ""}`} href={import.meta.env.DEV ? undefined : "./collector.js"} download={!import.meta.env.DEV} onClick={(e) => { if (import.meta.env.DEV) { e.preventDefault(); window.alert(t("collectorDevAlert")); } }}>{t(import.meta.env.DEV ? "collectorDevelopment" : "collectorProduction")}</a>
              <input ref={inputRef} type="file" accept="application/json,.json" onChange={handleFileChange} hidden />
            </div>
            <aside className="roadmap-card"><p className="eyebrow">{t("steps")}</p><ol>{readiness.map((item, index) => <li className={item.done ? "done" : ""} key={item.label}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.label}</b><i /></li>)}</ol></aside>
          </div>
          {error && <div className="message error" role="alert">{error}</div>}

          {imported && <>
            <section className="preview">
              <div className="preview-title"><div><p className="eyebrow">{t("validImport")}</p><h2>{t("previewTitle")}</h2></div><span>{imported.fileName} · {formatBytes(imported.fileSize)}</span></div>
              <div className="metrics"><article><span>{t("fetchedPages")}</span><strong>{imported.preview.pageCount}</strong></article><article><span>{t("fetchedMatches")}</span><strong>{imported.preview.rawMatchCount}</strong></article><article><span>{t("uniqueMatches")}</span><strong>{imported.preview.uniqueMatchCount}</strong></article><article><span>{t("warnings")}</span><strong>{imported.preview.warnings.length}</strong></article></div>
              <dl className="preview-details"><div><dt>{t("newest")}</dt><dd>{formatTimestamp(imported.preview.newestPlayedAt)}</dd></div><div><dt>{t("oldest")}</dt><dd>{formatTimestamp(imported.preview.oldestPlayedAt)}</dd></div><div><dt>{t("duplicates")}</dt><dd>{imported.preview.duplicateCount} {t("mergedMatches")}</dd></div><div><dt>{t("buildId")}</dt><dd>{imported.preview.buildId ?? t("unknownSinglePage")}</dd></div></dl>
              <div className="source-grid">{imported.preview.sources.map(source => <article key={source.sourceType}><span>{source.sourceType}</span><strong>{source.pages}<small> / {source.expectedPages} pages</small></strong><p>{source.rawMatches} {t("rawMatches")}</p></article>)}</div>
              {imported.preview.warnings.length > 0 && <ul className="warning-list">{imported.preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            </section>

            <section className="statistics-section">
              <div className="section-heading"><div><p className="eyebrow">{t("localAnalysis")}</p><h2>{t("recordTitle")}</h2></div><p>{t("showingMatches", { shown: filteredMatches.length, total: imported.preview.uniqueMatchCount })}</p></div>
              <div className="filter-bar">
                <label><span>{t("fromDate")}</span><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label><label><span>{t("toDate")}</span><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
                <label><span>{t("mode")}</span><select value={mode} onChange={e => setMode(e.target.value)}><option value="">{t("all")}</option>{imported.preview.sources.filter(s => s.sourceType !== "all" && s.sourceType !== "unknown").map(s => <option key={s.sourceType}>{s.sourceType}</option>)}</select></label>
                <label><span>{t("yourCharacter")}</span><select value={subjectCharacterId} onChange={e => setSubjectCharacterId(e.target.value)}><option value="">{t("all")}</option>{allStatistics.bySubjectCharacter.filter(r => r.characterId !== null).map(r => <option key={r.characterId} value={r.characterId ?? ""}>{r.characterName}</option>)}</select></label>
                <label><span>{t("opponentCharacter")}</span><select value={opponentCharacterId} onChange={e => setOpponentCharacterId(e.target.value)}><option value="">{t("all")}</option>{allStatistics.byOpponentCharacter.filter(r => r.characterId !== null).map(r => <option key={r.characterId} value={r.characterId ?? ""}>{r.characterName}</option>)}</select></label>
                <button type="button" onClick={resetFilters}>{t("reset")}</button>
              </div>
              <div className="record-banner"><article><span>{t("winRate")}</span><strong>{formatWinRate(statistics.overall.winRate)}</strong></article><article><span>{t("wins")}</span><strong>{statistics.overall.wins}</strong></article><article><span>{t("losses")}</span><strong>{statistics.overall.losses}</strong></article><article><span>{t("undecided")}</span><strong>{statistics.overall.unknown + statistics.overall.draws}</strong></article></div>
              <div className="analysis-grid"><CharacterPanel eyebrow={t("yourFighters")} title={t("yourCharacterRecords")} records={statistics.bySubjectCharacter} recordLine={t} /><CharacterPanel eyebrow={t("matchups")} title={t("opponentCharacterRecords")} records={statistics.byOpponentCharacter.slice(0, 8)} recordLine={t} /></div>
              <article className="recent-card"><div className="card-heading"><div><p className="eyebrow">{t("recentMatches")}</p><h3>{t("recentTitle")}</h3></div><span>{t("latestTen")}</span></div><div className="table-wrap"><table><thead><tr><th>{t("dateTime")}</th><th>{t("result")}</th><th>{t("yourCharacter")}</th><th>{t("opponent")}</th><th>{t("mode")}</th><th>{t("rating")}</th></tr></thead><tbody>{filteredMatches.slice(0, 10).map(match => <tr key={match.replayId}><td>{formatTimestamp(match.playedAtEpoch)}</td><td><span className={`result-badge ${match.result}`}>{match.result}</span></td><td>{playerCharacterName(match.subject)}</td><td>{playerCharacterName(match.opponent)}</td><td>{match.battleTypeName ?? match.mode}</td><td>{match.subject.master_rating || match.subject.league_point || "—"}</td></tr>)}{filteredMatches.length === 0 && <tr><td className="empty-cell" colSpan={6}>{t("noRecords")}</td></tr>}</tbody></table></div></article>
            </section>
          </>}
        </section>
      </main>
      <footer><span>{t("appName")}</span><span>{t("unofficial")}</span></footer>
    </div>
  );
}

type CharacterRecord = ReturnType<typeof aggregateMatches>["bySubjectCharacter"][number];
function CharacterPanel({ eyebrow, title, records, recordLine }: { eyebrow: string; title: string; records: CharacterRecord[]; recordLine: (key: "recordLine", values: Record<string, number>) => string }) {
  return <article className="analysis-card"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><div className="character-records">{records.map(record => <div key={`${record.characterId}-${record.characterSlug}`}><span>{record.characterName}</span><strong>{formatWinRate(record.winRate)}</strong><small>{recordLine("recordLine", { matches: record.matches, wins: record.wins, losses: record.losses })}</small></div>)}</div></article>;
}
