import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { parseCollectorImport } from "../domain/buckler/parseCollectorBundle";
import { getCharacterName } from "../domain/buckler/characterNames";
import { compareCharacterSlugs } from "../domain/buckler/characterOrder";
import { getRoundDetails } from "../domain/buckler/roundResults";
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

function formatRating(player: BucklerBundlePreview["matches"][number]["subject"]): string {
  const ratings = [];
  if ((player.league_point ?? 0) > 0) ratings.push(`${player.league_point?.toLocaleString()} LP`);
  if ((player.master_rating ?? 0) > 0) ratings.push(`${player.master_rating?.toLocaleString()} MR`);
  return ratings.join(" · ") || "—";
}

function getInputType(inputType: number | undefined, locale: "ja" | "en"): string {
  if (inputType === 0) return locale === "ja" ? "クラシック" : "Classic";
  if (inputType === 1) return locale === "ja" ? "モダン" : "Modern";
  if (inputType === 2) return locale === "ja" ? "ダイナミック" : "Dynamic";
  return "—";
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
    { label: t("chartDisplay"), done: imported !== null },
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
        <section className="workspace">
          <div className="section-heading"><div><p className="eyebrow">{t("importEyebrow")}</p><h2>{t("importTitle")}</h2></div><p>{t("userCode")} <strong>{INITIAL_USER_CODE}</strong></p></div>
          {!imported ? <div className="workspace-grid">
            <div className={`drop-zone ${isDragging ? "is-dragging" : ""}`} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDragOver={(e) => e.preventDefault()} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); void importFile(e.dataTransfer.files[0]); }}>
              <div className="drop-symbol"><span>↓</span></div><h3>{t("dropTitle")}</h3><p>{t("dropDescription")}</p>
              <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>{t("selectFile")}</button>
              <a className={`collector-link ${import.meta.env.DEV ? "is-disabled" : ""}`} href={import.meta.env.DEV ? undefined : "./collector.js"} download={!import.meta.env.DEV} onClick={(e) => { if (import.meta.env.DEV) { e.preventDefault(); window.alert(t("collectorDevAlert")); } }}>{t(import.meta.env.DEV ? "collectorDevelopment" : "collectorProduction")}</a>
              <input ref={inputRef} type="file" accept="application/json,.json" onChange={handleFileChange} hidden />
            </div>
            <aside className="roadmap-card"><p className="eyebrow">{t("steps")}</p><ol>{readiness.map((item, index) => <li className={item.done ? "done" : ""} key={item.label}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.label}</b><i /></li>)}</ol></aside>
          </div> : <div className="loaded-file-bar">
            <div><p className="eyebrow">{t("validImport")}</p><strong>{imported.fileName}</strong><span>{formatBytes(imported.fileSize)} · {imported.preview.uniqueMatchCount} {t("uniqueMatches")}</span></div>
            <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>{t("replaceFile")}</button>
            <input ref={inputRef} type="file" accept="application/json,.json" onChange={handleFileChange} hidden />
          </div>}
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
                <label><span>{t("yourCharacter")}</span><select value={subjectCharacterId} onChange={e => setSubjectCharacterId(e.target.value)}><option value="">{t("all")}</option>{[...allStatistics.bySubjectCharacter].sort((a, b) => compareCharacterSlugs(a.characterSlug, b.characterSlug)).filter(r => r.characterId !== null).map(r => { const sample = imported.preview.matches.find(m => (m.subject.playing_character_id ?? m.subject.character_id) === r.characterId); return <option key={r.characterId} value={r.characterId ?? ""}>{sample ? getCharacterName(sample.subject, locale) : r.characterName}</option>; })}</select></label>
                <label><span>{t("opponentCharacter")}</span><select value={opponentCharacterId} onChange={e => setOpponentCharacterId(e.target.value)}><option value="">{t("all")}</option>{[...allStatistics.byOpponentCharacter].sort((a, b) => compareCharacterSlugs(a.characterSlug, b.characterSlug)).filter(r => r.characterId !== null).map(r => { const sample = imported.preview.matches.find(m => (m.opponent.playing_character_id ?? m.opponent.character_id) === r.characterId); return <option key={r.characterId} value={r.characterId ?? ""}>{sample ? getCharacterName(sample.opponent, locale) : r.characterName}</option>; })}</select></label>
                <button type="button" onClick={resetFilters}>{t("reset")}</button>
              </div>
              <div className="record-banner"><article><span>{t("winRate")}</span><strong>{formatWinRate(statistics.overall.winRate)}</strong></article><article><span>{t("wins")}</span><strong>{statistics.overall.wins}</strong></article><article><span>{t("losses")}</span><strong>{statistics.overall.losses}</strong></article><article><span>{t("undecided")}</span><strong>{statistics.overall.unknown + statistics.overall.draws}</strong></article></div>
              <RatingChart matches={filteredMatches} locale={locale} labels={{ eyebrow: t("ratingHistory"), title: t("ratingChartTitle"), character: t("ratingCharacter"), latest: t("latestRating"), highest: t("highestRating"), lowest: t("lowestRating"), change: t("ratingChange"), noData: t("noRatingData"), firstMatch: t("firstMatch"), latestMatch: t("latestMatch") }} />
              <div className="analysis-grid"><CharacterPanel eyebrow={t("yourFighters")} title={t("yourCharacterRecords")} records={statistics.bySubjectCharacter} matches={filteredMatches} side="subject" locale={locale} recordLine={t} /><CharacterPanel eyebrow={t("matchups")} title={t("opponentCharacterRecords")} records={statistics.byOpponentCharacter} matches={filteredMatches} side="opponent" locale={locale} recordLine={t} /></div>
              <article className="recent-card"><div className="card-heading"><div><p className="eyebrow">{t("recentMatches")}</p><h3>{t("recentTitle")}</h3></div><span>{t("latestHundred")}</span></div><div className="table-wrap"><table className="match-table"><thead><tr><th>{t("dateTime")}</th><th>{t("result")}</th><th>{t("yourPlayer")}</th><th>{t("opponentPlayer")}</th><th>{t("mode")}</th><th>{t("replayId")}</th></tr></thead><tbody>{filteredMatches.slice(0, 100).map(match => <tr key={match.replayId}><td><span className="primary-detail">{formatTimestamp(match.playedAtEpoch)}</span></td><td><span className={`result-badge ${match.result}`}>{match.result}</span><small className="secondary-detail">{match.roundsWon} - {match.roundsLost} {t("rounds")}</small><div className="round-details">{getRoundDetails(match.subject.round_results, match.opponent.round_results, locale).map(round => <span className={round.outcome} key={round.round} title={round.description}>R{round.round} <b>{round.outcome === "win" ? "W" : round.outcome === "loss" ? "L" : "D"}</b> {round.method}</span>)}</div></td><td><strong className="character-detail">{getCharacterName(match.subject, locale)}</strong><small className="secondary-detail">{getInputType(match.subject.battle_input_type, locale)}</small><small className="secondary-detail rating-detail">{formatRating(match.subject)}</small></td><td><strong className="player-detail">{match.opponent.player.fighter_id ?? "—"}</strong><small className="secondary-detail">{getCharacterName(match.opponent, locale)} · {getInputType(match.opponent.battle_input_type, locale)}</small><small className="secondary-detail rating-detail">{formatRating(match.opponent)}</small><small className="secondary-detail">{match.opponent.player.short_id} · {match.opponent.player.platform_name ?? "—"}</small></td><td><span className="primary-detail">{match.battleTypeName ?? match.mode}</span><small className="secondary-detail">{match.sourceTypes.join(" · ")}</small></td><td><code className="replay-code">{match.replayId}</code></td></tr>)}{filteredMatches.length === 0 && <tr><td className="empty-cell" colSpan={6}>{t("noRecords")}</td></tr>}</tbody></table></div></article>
            </section>
          </>}
        </section>
      </main>
      <footer><span>{t("appName")}</span><span>{t("unofficial")}</span></footer>
    </div>
  );
}

function RatingChart({ matches, locale, labels }: { matches: BucklerBundlePreview["matches"]; locale: "ja" | "en"; labels: Record<"eyebrow" | "title" | "character" | "latest" | "highest" | "lowest" | "change" | "noData" | "firstMatch" | "latestMatch", string> }) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const characterGroups = new Map<string, BucklerBundlePreview["matches"]>();
  for (const match of matches) {
    const id = match.subject.playing_character_id ?? match.subject.character_id;
    const slug = match.subject.playing_character_tool_name ?? match.subject.character_tool_name ?? "unknown";
    const key = id === undefined ? `slug:${slug}` : `id:${id}`;
    characterGroups.set(key, [...(characterGroups.get(key) ?? []), match]);
  }
  const characters = [...characterGroups.entries()].sort((left, right) => right[1].length - left[1].length || compareCharacterSlugs(left[1][0]?.subject.playing_character_tool_name ?? left[1][0]?.subject.character_tool_name ?? "unknown", right[1][0]?.subject.playing_character_tool_name ?? right[1][0]?.subject.character_tool_name ?? "unknown"));
  const effectiveCharacter = characters.some(([key]) => key === selectedCharacter) ? selectedCharacter : characters[0]?.[0] ?? "";
  const chartMatches = characterGroups.get(effectiveCharacter) ?? [];
  const ordered = [...chartMatches].sort((a, b) => a.playedAtEpoch - b.playedAtEpoch);
  const number = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");
  const width = 1000, height = 230, padX = 22, padY = 18;
  function series(kind: "lp" | "mr") {
    const points = ordered.map((match, matchIndex) => ({ match, matchIndex, value: kind === "lp" ? match.subject.league_point : match.subject.master_rating })).filter((point): point is { match: typeof ordered[number]; matchIndex: number; value: number } => (point.value ?? 0) > 0);
    if (!points.length) return null;
    const values = points.map(point => point.value), highest = Math.max(...values), lowest = Math.min(...values), range = Math.max(highest - lowest, kind === "lp" ? 100 : 10), min = lowest - range * .12, max = highest + range * .12;
    const coordinates = points.map(point => ({ x: padX + (ordered.length === 1 ? (width - padX * 2) / 2 : point.matchIndex * (width - padX * 2) / (ordered.length - 1)), y: padY + (max - point.value) * (height - padY * 2) / (max - min), value: point.value, replayId: point.match.replayId }));
    return { kind, coordinates, line: coordinates.map(point => `${point.x},${point.y}`).join(" "), latest: values.at(-1) as number, highest, lowest, change: (values.at(-1) as number) - values[0] };
  }
  const lp = series("lp"), mr = series("mr"), seriesList = [lp, mr].filter((item): item is NonNullable<typeof item> => item !== null);
  const characterSelector = characters.length > 1 && <label className="rating-character-select"><span>{labels.character}</span><select value={effectiveCharacter} onChange={event => setSelectedCharacter(event.target.value)}>{characters.map(([key, characterMatches]) => <option key={key} value={key}>{getCharacterName(characterMatches[0].subject, locale)}</option>)}</select></label>;
  if (!seriesList.length) return <article className="lp-card"><div className="lp-heading"><div><p className="eyebrow">{labels.eyebrow}</p><h3>{labels.title}</h3></div>{characterSelector}</div><p className="lp-empty">{labels.noData}</p></article>;
  return <article className="lp-card"><div className="lp-heading"><div><p className="eyebrow">{labels.eyebrow}</p><h3>{labels.title}</h3></div><div className="rating-controls">{characterSelector}<div className="rating-metrics">{([lp, mr] as const).map((item, index) => <div className={`rating-summary ${index ? "mr" : "lp"}`} key={index ? "mr" : "lp"}><b>{index ? "MR" : "LP"}</b>{item ? <><span>{labels.latest}<strong>{number.format(item.latest)}</strong></span><small>{labels.highest} {number.format(item.highest)} · {labels.lowest} {number.format(item.lowest)} · {labels.change} <em className={item.change >= 0 ? "positive" : "negative"}>{item.change >= 0 ? "+" : ""}{number.format(item.change)}</em></small></> : <small>{labels.noData}</small>}</div>)}</div></div></div><div className="lp-chart">{lp && <><span className="lp-axis maximum">{number.format(lp.highest)} LP</span><span className="lp-axis minimum">{number.format(lp.lowest)} LP</span></>}{mr && <><span className="lp-axis maximum right">{number.format(mr.highest)} MR</span><span className="lp-axis minimum right">{number.format(mr.lowest)} MR</span></>}<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={labels.title} preserveAspectRatio="none"><line x1={padX} y1={padY} x2={width - padX} y2={padY} className="grid-line"/><line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} className="grid-line"/>{seriesList.map(item => <g className={`rating-series ${item.kind}`} key={item.kind}><polyline points={item.line}/>{item.coordinates.map(point => <circle key={`${point.replayId}-${item.kind}`} cx={point.x} cy={point.y} r="3"><title>{number.format(point.value)} {item.kind.toUpperCase()}</title></circle>)}</g>)}</svg><div className="match-axis"><span>{labels.firstMatch}</span><span>{labels.latestMatch} · {number.format(ordered.length)}</span></div></div></article>;
}

type CharacterRecord = ReturnType<typeof aggregateMatches>["bySubjectCharacter"][number];
function CharacterPanel({ eyebrow, title, records, matches, side, locale, recordLine }: { eyebrow: string; title: string; records: CharacterRecord[]; matches: BucklerBundlePreview["matches"]; side: "subject" | "opponent"; locale: "ja" | "en"; recordLine: (key: "recordLine", values: Record<string, number>) => string }) {
  return <article className={`analysis-card character-panel ${side === "opponent" ? "is-opponent" : ""}`}><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><div className="character-records">{records.map(record => { const sample = matches.find(match => (match[side].playing_character_id ?? match[side].character_id) === record.characterId); const winRate = record.winRate ?? 0; return <div key={`${record.characterId}-${record.characterSlug}`}><span className="character-name">{sample ? getCharacterName(sample[side], locale) : record.characterName}</span>{side === "opponent" ? <strong className="match-count">{record.matches}<small>{locale === "ja" ? "戦" : " matches"}</small></strong> : <strong>{formatWinRate(record.winRate)}</strong>}<small className="record-line">{recordLine("recordLine", { matches: record.matches, wins: record.wins, losses: record.losses })}</small>{side === "opponent" && <div className="win-rate"><i style={{ width: `${winRate}%` }} /><span>{formatWinRate(record.winRate)}</span></div>}</div>; })}</div></article>;
}
