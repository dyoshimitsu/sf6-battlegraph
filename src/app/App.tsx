import { useEffect, useMemo, useRef, useState } from "react";
import { parseCollectorImport } from "../domain/buckler/parseCollectorBundle";
import { getCharacterName, getCharacterNameBySlug } from "../domain/buckler/characterNames";
import { compareCharacterSlugs } from "../domain/buckler/characterOrder";
import { getRoundDetails } from "../domain/buckler/roundResults";
import { BucklerValidationError, type BucklerBundlePreview, type NormalizedMatch } from "../domain/buckler/types";
import { aggregateMatches, filterMatches } from "../domain/statistics/aggregateMatches";
import { useI18n } from "../i18n/useI18n";
import { deploymentConfig, firebaseRuntime } from "../firebase/client";
import { useAdminAuth } from "../firebase/useAdminAuth";
import { buildSyncPlan } from "../domain/storage/syncPlan";
import { executeSyncPlan, type SyncProgress } from "../domain/storage/executeSyncPlan";
import { createFirestoreSyncPort } from "../firebase/firestoreSyncPort";
import { loadStoredMatches, type StoredManifest } from "../domain/storage/loadStoredMatches";
import { createFirestoreReadPort } from "../firebase/firestoreReadPort";
import { summarizeStoredMerge } from "../domain/storage/mergeStoredMatches";
import { createSyncId } from "../domain/storage/createSyncId";
import { exportFirestoreArchive } from "../domain/storage/exportArchive";
import { createFirestoreArchivePort } from "../firebase/firestoreArchivePort";
import { validateFirestoreArchive } from "../domain/storage/validateArchive";
import { buildRestorePlan, executeRestorePlan } from "../domain/storage/restoreArchive";
import { createFirestoreRestorePort } from "../firebase/firestoreRestorePort";
import { completeOpponentRoster } from "../domain/statistics/completeOpponentRoster";
import { buildBucklerLaunchUrl, createCollectorStartMessage, readCollectorResultMessage, readCollectorStatusMessage } from "../collector/bridge";
import { shouldAutoSyncCollectorBundle } from "./autoSync";

const INITIAL_USER_CODE = deploymentConfig.playerUserCode;

interface ImportedBundle {
  fileName: string;
  fileSize: number;
  source: unknown;
  canSync: boolean;
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

function getInputType(inputType: number | undefined): string {
  if (inputType === 0) return "C";
  if (inputType === 1) return "M";
  if (inputType === 2) return "D";
  return "—";
}

function storedPreview(matches: NormalizedMatch[], chunkCount: number): BucklerBundlePreview {
  const ordered = [...matches].sort((left, right) => right.playedAtEpoch - left.playedAtEpoch || left.replayId.localeCompare(right.replayId));
  const modes = [...new Set(ordered.map(match => match.mode))];
  return {
    userCode: INITIAL_USER_CODE,
    pageCount: chunkCount,
    rawMatchCount: ordered.length,
    uniqueMatchCount: ordered.length,
    duplicateCount: 0,
    oldestPlayedAt: ordered.at(-1)?.playedAtEpoch,
    newestPlayedAt: ordered[0]?.playedAtEpoch,
    matches: ordered,
    sources: modes.map(sourceType => ({ sourceType, pages: 0, expectedPages: 0, rawMatches: ordered.filter(match => match.mode === sourceType).length })),
    warnings: [],
    isSinglePage: false,
  };
}

export function App() {
  const { locale, setLocale, t } = useI18n();
  const adminAuth = useAdminAuth(firebaseRuntime);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const collectorTimeoutRef = useRef<number | null>(null);
  const [imported, setImported] = useState<ImportedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mode, setMode] = useState("");
  const [subjectCharacterId, setSubjectCharacterId] = useState("");
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingStored, setIsLoadingStored] = useState(false);
  const [archivedMatches, setArchivedMatches] = useState<NormalizedMatch[] | null>(null);
  const [storedManifest, setStoredManifest] = useState<StoredManifest | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [autoSyncPending, setAutoSyncPending] = useState(false);

  const dateTimeFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
  }), [locale]);
  const formatTimestamp = (timestamp?: number) => timestamp === undefined ? "—" : dateTimeFormatter.format(new Date(timestamp * 1000));

  const filteredMatches = useMemo(() => filterMatches(imported?.preview.matches ?? [], {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    mode: mode ? mode as BucklerBundlePreview["matches"][number]["mode"] : undefined,
    subjectCharacterId: subjectCharacterId ? Number(subjectCharacterId) : undefined,
  }), [fromDate, imported, mode, subjectCharacterId, toDate]);
  const statistics = useMemo(() => aggregateMatches(filteredMatches), [filteredMatches]);
  const allStatistics = useMemo(() => aggregateMatches(imported?.preview.matches ?? []), [imported]);
  const opponentRecords = useMemo(() => completeOpponentRoster(statistics.byOpponentCharacter, slug => getCharacterNameBySlug(slug, locale)), [locale, statistics.byOpponentCharacter]);
  const pendingMerge = useMemo(() => imported?.canSync && archivedMatches !== null
    ? summarizeStoredMerge(archivedMatches, imported.preview.matches)
    : null, [archivedMatches, imported]);
  const authLabel = adminAuth.state.status === "disabled" ? t("localPreview")
    : adminAuth.state.status === "loading" ? t("firebaseConnecting")
      : adminAuth.state.status === "signedOut" ? t("firebaseSignedOut")
        : adminAuth.state.status === "admin" ? t("syncReady")
          : adminAuth.state.status === "notAdmin" ? t("notAdmin") : t("firebaseError");

  useEffect(() => {
    if (firebaseRuntime.status !== "ready" || (deploymentConfig.visibility !== "public" && adminAuth.state.status !== "admin") || imported !== null) return;
    const db = firebaseRuntime.services.db;
    let active = true;
    setIsLoadingStored(true);
    void loadStoredMatches(createFirestoreReadPort(db), INITIAL_USER_CODE).then(stored => {
      if (!active) return;
      setArchivedMatches(stored?.matches ?? []);
      setStoredManifest(stored?.manifest ?? null);
      if (!stored) return;
      setImported({ fileName: t("storedData"), fileSize: 0, source: null, canSync: false, preview: storedPreview(stored.matches, stored.manifest.chunks.length) });
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : t("storedLoadFailed")); })
      .finally(() => { if (active) setIsLoadingStored(false); });
    return () => { active = false; };
  }, [adminAuth.state.status, imported !== null, t]);

  useEffect(() => {
    function receiveCollectorResult(event: MessageEvent) {
      const status = readCollectorStatusMessage(event.origin, event.data, window.location.origin);
      if (status) {
        if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
        collectorTimeoutRef.current = window.setTimeout(() => {
          collectorTimeoutRef.current = null;
          setIsCollecting(false);
          setError(t("collectorLoginTimeout"));
        }, 10 * 60_000);
        setError(t("collectorAuthenticationRequired"));
        return;
      }
      const message = readCollectorResultMessage(event.origin, event.data, window.location.origin);
      if (!message) return;
      if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
      collectorTimeoutRef.current = null;
      setIsCollecting(false);
      setError(null);
      try {
        const preview = parseCollectorImport(message.bundle, INITIAL_USER_CODE);
        setImported({ fileName: t("collectorTransfer"), fileSize: new Blob([JSON.stringify(message.bundle)]).size, source: message.bundle, canSync: true, preview });
        setAutoSyncPending(true);
      } catch (cause) {
        setImported(null);
        setError(cause instanceof BucklerValidationError ? cause.message : t("errorUnexpected"));
      }
    }
    window.addEventListener("message", receiveCollectorResult);
    return () => {
      window.removeEventListener("message", receiveCollectorResult);
      if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
    };
  }, [t]);

  useEffect(() => {
    if (!shouldAutoSyncCollectorBundle(autoSyncPending, imported?.canSync === true, adminAuth.state.status)) return;
    setAutoSyncPending(false);
    void synchronize();
  }, [adminAuth.state.status, autoSyncPending, imported]);

  function openBuckler() {
    const url = buildBucklerLaunchUrl(INITIAL_USER_CODE, window.location.origin);
    window.postMessage(createCollectorStartMessage(url), window.location.origin);
    setError(null);
    setIsCollecting(true);
    if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
    collectorTimeoutRef.current = window.setTimeout(() => {
      collectorTimeoutRef.current = null;
      setIsCollecting(false);
      setError(t("collectorTimeout"));
    }, 30_000);
  }

  function resetFilters() {
    setFromDate(""); setToDate(""); setMode(""); setSubjectCharacterId("");
  }

  async function synchronize() {
    if (!imported?.canSync || firebaseRuntime.status !== "ready" || adminAuth.state.status !== "admin") return;
    setIsSyncing(true); setSyncMessage(null); setSyncProgress(null);
    try {
      const id = createSyncId();
      const loaded = archivedMatches === null ? await loadStoredMatches(createFirestoreReadPort(firebaseRuntime.services.db), INITIAL_USER_CODE) : null;
      const existing = archivedMatches ?? loaded?.matches ?? [];
      const previousManifest = storedManifest ?? loaded?.manifest;
      const summary = summarizeStoredMerge(existing, imported.preview.matches);
      const plan = buildSyncPlan(imported.source, imported.preview, id, id, deploymentConfig.visibility, existing, previousManifest);
      await executeSyncPlan(createFirestoreSyncPort(firebaseRuntime.services.db), plan, setSyncProgress);
      setArchivedMatches(plan.storedMatches);
      setStoredManifest({ ...(plan.manifest.data as unknown as StoredManifest), obsoleteChunkIds: [] });
      setImported({ fileName: t("storedData"), fileSize: 0, source: null, canSync: false, preview: storedPreview(plan.storedMatches, (plan.manifest.data.chunks as unknown[]).length) });
      setSyncMessage(t("syncComplete", { count: summary.totalMatches, newCount: summary.newMatches, refreshedCount: summary.refreshedMatches, retainedCount: summary.retainedMatches }));
    } catch (cause) {
      setSyncMessage(cause instanceof Error ? cause.message : t("syncFailed"));
    } finally { setIsSyncing(false); }
  }

  async function exportBackup() {
    if (firebaseRuntime.status !== "ready" || adminAuth.state.status !== "admin" || !window.confirm(t("backupConfirm"))) return;
    setIsExporting(true); setError(null);
    try {
      const archive = validateFirestoreArchive(await exportFirestoreArchive(createFirestoreArchivePort(firebaseRuntime.services.db), INITIAL_USER_CODE));
      const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sf6-battlegraph-backup-${INITIAL_USER_CODE}-${archive.exportedAt.replace(/[:.]/g, "-")}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("backupFailed"));
    } finally { setIsExporting(false); }
  }

  async function restoreBackup(file?: File) {
    if (!file || firebaseRuntime.status !== "ready" || adminAuth.state.status !== "admin") return;
    setError(null); setRestoreProgress(null);
    try {
      const plan = buildRestorePlan(JSON.parse(await file.text()) as unknown, INITIAL_USER_CODE, deploymentConfig.visibility);
      if (!window.confirm(t("restoreConfirm", { count: plan.writeCount }))) return;
      setIsRestoring(true); setRestoreProgress(t("restoreProgress", { completed: 0, total: plan.writeCount }));
      await executeRestorePlan(createFirestoreRestorePort(firebaseRuntime.services.db), plan, (completed, total) => setRestoreProgress(t("restoreProgress", { completed, total })));
      const stored = await loadStoredMatches(createFirestoreReadPort(firebaseRuntime.services.db), INITIAL_USER_CODE);
      if (!stored) throw new Error(t("storedLoadFailed"));
      setArchivedMatches(stored.matches); setStoredManifest(stored.manifest);
      setImported({ fileName: t("storedData"), fileSize: 0, source: null, canSync: false, preview: storedPreview(stored.matches, stored.manifest.chunks.length) });
      setRestoreProgress(t("restoreComplete", { count: plan.writeCount }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("restoreFailed"));
    } finally { setIsRestoring(false); }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top"><span className="brand-mark">B</span><span><strong>{t("appName")}</strong><small>{t("appTagline")}</small></span></a>
        <div className="header-actions">
          <span className={`status-pill auth-${adminAuth.state.status}`} title={adminAuth.state.status === "error" ? adminAuth.state.message : undefined}><i /> {authLabel}</span>
          {adminAuth.state.status === "signedOut" && <button className="auth-button" type="button" onClick={() => void adminAuth.signIn()}>{t("googleSignIn")}</button>}
          {adminAuth.state.status === "admin" && <button className="auth-button header-sync-button" type="button" disabled={isCollecting || isSyncing} onClick={openBuckler}>{t(isCollecting ? "collectingFromBuckler" : isSyncing ? "syncing" : "refreshFromBuckler")}</button>}
          {(adminAuth.state.status === "admin" || adminAuth.state.status === "notAdmin") && <button className="auth-button" type="button" onClick={() => void adminAuth.signOut()}>{t("signOut")}</button>}
          {adminAuth.state.status === "admin" && <button className="auth-button" type="button" disabled={isExporting} onClick={() => void exportBackup()}>{isExporting ? t("backupExporting") : t("backupExport")}</button>}
          {adminAuth.state.status === "admin" && <button className="auth-button" type="button" disabled={isRestoring} onClick={() => restoreInputRef.current?.click()}>{isRestoring ? t("restoreRunning") : t("restoreBackup")}</button>}
          <input ref={restoreInputRef} type="file" accept="application/json,.json" hidden onChange={event => { void restoreBackup(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="language-switch" aria-label="Language">
            <button className={locale === "ja" ? "active" : ""} onClick={() => setLocale("ja")}>JP</button>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="workspace">
          {isLoadingStored && <div className="message" role="status">{t("loadingStored")}</div>}
          {imported?.canSync && adminAuth.state.status === "admin" && <div className="sync-bar"><div><p className="eyebrow">FIRESTORE</p><strong>{t("syncTitle")}</strong><span>{syncProgress ? `${syncProgress.completed} / ${syncProgress.total}` : pendingMerge ? t("syncPreview", { count: pendingMerge.totalMatches, newCount: pendingMerge.newMatches, refreshedCount: pendingMerge.refreshedMatches, retainedCount: pendingMerge.retainedMatches }) : t("syncDescription")}</span></div><button className="primary-button" type="button" disabled={isSyncing} onClick={() => void synchronize()}>{isSyncing ? t("syncing") : t("syncNow")}</button></div>}
          {syncMessage && <div className={`message ${syncProgress?.phase === "complete" ? "success" : "error"}`} role="status">{syncMessage}</div>}
          {restoreProgress && <div className={`message ${isRestoring ? "" : "success"}`} role="status">{restoreProgress}</div>}
          {error && <div className="message error" role="alert">{error}</div>}

          {imported && <>
            {imported.canSync && <section className="preview">
              <div className="preview-title"><div><p className="eyebrow">{t("validImport")}</p><h2>{t("previewTitle")}</h2></div><span>{imported.fileName} · {formatBytes(imported.fileSize)}</span></div>
              <div className="metrics"><article><span>{t("fetchedPages")}</span><strong>{imported.preview.pageCount}</strong></article><article><span>{t("fetchedMatches")}</span><strong>{imported.preview.rawMatchCount}</strong></article><article><span>{t("uniqueMatches")}</span><strong>{imported.preview.uniqueMatchCount}</strong></article><article><span>{t("warnings")}</span><strong>{imported.preview.warnings.length}</strong></article></div>
              <dl className="preview-details"><div><dt>{t("newest")}</dt><dd>{formatTimestamp(imported.preview.newestPlayedAt)}</dd></div><div><dt>{t("oldest")}</dt><dd>{formatTimestamp(imported.preview.oldestPlayedAt)}</dd></div><div><dt>{t("duplicates")}</dt><dd>{imported.preview.duplicateCount} {t("mergedMatches")}</dd></div><div><dt>{t("buildId")}</dt><dd>{imported.preview.buildId ?? t("unknownSinglePage")}</dd></div></dl>
              <div className="source-grid">{imported.preview.sources.map(source => <article key={source.sourceType}><span>{source.sourceType}</span><strong>{source.pages}<small> / {source.expectedPages} pages</small></strong><p>{source.rawMatches} {t("rawMatches")}</p></article>)}</div>
              {imported.preview.warnings.length > 0 && <ul className="warning-list">{imported.preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            </section>}

            <section className="statistics-section">
              <div className="section-heading"><div><p className="eyebrow">{t("localAnalysis")}</p><h2>{t("recordTitle")}</h2></div><p>{t("showingMatches", { shown: filteredMatches.length, total: imported.preview.uniqueMatchCount })}</p></div>
              <article className="recent-card"><div className="card-heading"><div><p className="eyebrow">{t("recentMatches")}</p><h3>{t("recentTitle")}</h3></div><span>{t("latestHundred")}</span></div><div className="table-wrap"><table className="match-table"><thead><tr><th>{t("dateTime")}</th><th>{t("result")}</th><th>{t("yourPlayer")}</th><th>{t("opponentPlayer")}</th><th>{t("mode")}</th><th>{t("replayId")}</th></tr></thead><tbody>{imported.preview.matches.slice(0, 100).map(match => <tr key={match.replayId}><td><span className="primary-detail">{formatTimestamp(match.playedAtEpoch)}</span></td><td><span className={`result-badge ${match.result}`}>{match.result}</span><div className="round-details">{getRoundDetails(match.subject.round_results, match.opponent.round_results, locale).map(round => <span className={round.outcome} key={round.round} title={`R${round.round}: ${round.description}`} aria-label={`Round ${round.round}: ${round.outcome}, ${round.description}`}>{round.method}</span>)}</div></td><td><strong className="character-detail">{getCharacterName(match.subject, locale)}</strong><small className="input-detail">{getInputType(match.subject.battle_input_type)}</small><small className="secondary-detail rating-detail">{formatRating(match.subject)}</small></td><td><strong className="character-detail">{getCharacterName(match.opponent, locale)}</strong><small className="input-detail">{getInputType(match.opponent.battle_input_type)}</small><small className="secondary-detail rating-detail">{formatRating(match.opponent)}</small><small className="secondary-detail opponent-identity">{match.opponent.player.fighter_id ?? "—"} · {match.opponent.player.short_id} · {match.opponent.player.platform_name ?? "—"}</small></td><td><span className="primary-detail">{match.battleTypeName ?? match.mode}</span></td><td><code className="replay-code">{match.replayId}</code></td></tr>)}</tbody></table></div></article>
              <div className="filter-bar">
                <label><span>{t("fromDate")}</span><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label><label><span>{t("toDate")}</span><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
                <label><span>{t("mode")}</span><select value={mode} onChange={e => setMode(e.target.value)}><option value="">{t("all")}</option>{imported.preview.sources.filter(s => s.sourceType !== "all" && s.sourceType !== "unknown").map(s => <option key={s.sourceType}>{s.sourceType}</option>)}</select></label>
                <label><span>{t("yourCharacter")}</span><select value={subjectCharacterId} onChange={e => setSubjectCharacterId(e.target.value)}><option value="">{t("all")}</option>{[...allStatistics.bySubjectCharacter].sort((a, b) => compareCharacterSlugs(a.characterSlug, b.characterSlug)).filter(r => r.characterId !== null).map(r => { const sample = imported.preview.matches.find(m => (m.subject.playing_character_id ?? m.subject.character_id) === r.characterId); return <option key={r.characterId} value={r.characterId ?? ""}>{sample ? getCharacterName(sample.subject, locale) : r.characterName}</option>; })}</select></label>
                <button type="button" onClick={resetFilters}>{t("reset")}</button>
              </div>
              <div className="record-banner"><article><span>{t("winRate")}</span><strong>{formatWinRate(statistics.overall.winRate)}</strong></article><article><span>{t("wins")}</span><strong>{statistics.overall.wins}</strong></article><article><span>{t("losses")}</span><strong>{statistics.overall.losses}</strong></article><article><span>{t("undecided")}</span><strong>{statistics.overall.unknown + statistics.overall.draws}</strong></article></div>
              <DailyTrend records={statistics.byDay} locale={locale} labels={{ eyebrow: t("dailyTrend"), title: t("dailyTrendTitle"), matches: t("dailyMatches"), winRate: t("winRate"), empty: t("noRecords"), activeDays: count => t("activeDays", { count }) }} />
              <RatingChart matches={filteredMatches} locale={locale} labels={{ eyebrow: t("ratingHistory"), title: t("ratingChartTitle"), character: t("ratingCharacter"), latest: t("latestRating"), highest: t("highestRating"), lowest: t("lowestRating"), change: t("ratingChange"), noData: t("noRatingData"), firstMatch: t("firstMatch"), latestMatch: t("latestMatch") }} />
              <div className="analysis-grid"><CharacterPanel eyebrow={t("yourFighters")} title={t("yourCharacterRecords")} records={statistics.bySubjectCharacter} matches={filteredMatches} side="subject" locale={locale} recordLine={t} /><CharacterPanel eyebrow={t("matchups")} title={t("opponentCharacterRecords")} records={opponentRecords} matches={filteredMatches} side="opponent" locale={locale} recordLine={t} /></div>
            </section>
          </>}
        </section>
      </main>
      <footer><span>{t("appName")}</span><span>{t("unofficial")}</span></footer>
    </div>
  );
}

type DailyRecord = ReturnType<typeof aggregateMatches>["byDay"][number];
function DailyTrend({ records, locale, labels }: { records: DailyRecord[]; locale: "ja" | "en"; labels: Record<"eyebrow" | "title" | "matches" | "winRate" | "empty", string> & { activeDays: (count: number) => string } }) {
  const recent = records.slice(-14);
  const maxMatches = Math.max(1, ...recent.map(record => record.matches));
  const date = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", timeZone: "Asia/Tokyo" });
  return <article className="daily-card"><div className="card-heading"><div><p className="eyebrow">{labels.eyebrow}</p><h3>{labels.title}</h3></div><span>{recent.length ? labels.activeDays(recent.length) : labels.empty}</span></div>{recent.length > 0 && <div className="daily-bars" style={{ gridTemplateColumns: `repeat(${recent.length}, minmax(24px, 1fr))` }}>{recent.map(record => <div className="daily-column" key={record.date} title={`${record.date} · ${record.matches} ${labels.matches} · ${labels.winRate} ${formatWinRate(record.winRate)}`}><div className="daily-plot"><i className="daily-volume" style={{ height: `${record.matches / maxMatches * 100}%` }}><b style={{ height: `${record.winRate ?? 0}%` }} /></i></div><strong>{record.matches}</strong><span>{date.format(new Date(`${record.date}T00:00:00+09:00`))}</span></div>)}</div>}</article>;
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
    const values = points.map(point => point.value), highest = Math.max(...values), lowest = Math.min(...values), step = kind === "lp" ? 1000 : 100;
    let min = Math.floor(lowest / step) * step, max = Math.ceil(highest / step) * step;
    if (min === max) { min -= step; max += step; }
    const y = (value: number) => padY + (max - value) * (height - padY * 2) / (max - min);
    const coordinates = points.map(point => ({ x: padX + (ordered.length === 1 ? (width - padX * 2) / 2 : point.matchIndex * (width - padX * 2) / (ordered.length - 1)), y: y(point.value), value: point.value, replayId: point.match.replayId }));
    const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => ({ value: min + index * step, y: y(min + index * step) }));
    return { kind, coordinates, ticks, line: coordinates.map(point => `${point.x},${point.y}`).join(" "), latest: values.at(-1) as number, highest, lowest, change: (values.at(-1) as number) - values[0] };
  }
  const lp = series("lp"), mr = series("mr"), seriesList = [lp, mr].filter((item): item is NonNullable<typeof item> => item !== null);
  const characterSelector = characters.length > 1 && <label className="rating-character-select"><span>{labels.character}</span><select value={effectiveCharacter} onChange={event => setSelectedCharacter(event.target.value)}>{characters.map(([key, characterMatches]) => <option key={key} value={key}>{getCharacterName(characterMatches[0].subject, locale)}</option>)}</select></label>;
  if (!seriesList.length) return <article className="lp-card"><div className="lp-heading"><div><p className="eyebrow">{labels.eyebrow}</p><h3>{labels.title}</h3></div>{characterSelector}</div><p className="lp-empty">{labels.noData}</p></article>;
  return <article className="lp-card"><div className="lp-heading"><div><p className="eyebrow">{labels.eyebrow}</p><h3>{labels.title}</h3></div><div className="rating-controls">{characterSelector}<div className="rating-metrics">{([lp, mr] as const).map((item, index) => <div className={`rating-summary ${index ? "mr" : "lp"}`} key={index ? "mr" : "lp"}><b>{index ? "MR" : "LP"}</b>{item ? <><span>{labels.latest}<strong>{number.format(item.latest)}</strong></span><small>{labels.highest} {number.format(item.highest)} · {labels.lowest} {number.format(item.lowest)} · {labels.change} <em className={item.change >= 0 ? "positive" : "negative"}>{item.change >= 0 ? "+" : ""}{number.format(item.change)}</em></small></> : <small>{labels.noData}</small>}</div>)}</div></div></div><div className="lp-chart">{seriesList.flatMap(item => item.ticks.map(tick => <span className={`rating-tick ${item.kind}`} style={{ top: `${tick.y / height * 100}%` }} key={`${item.kind}-${tick.value}`}>{number.format(tick.value)}</span>))}<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={labels.title} preserveAspectRatio="none">{seriesList.flatMap(item => item.ticks.map(tick => <line x1={padX} y1={tick.y} x2={width - padX} y2={tick.y} className={`grid-line ${item.kind}`} key={`${item.kind}-${tick.value}`} />))}{seriesList.map(item => <g className={`rating-series ${item.kind}`} key={item.kind}><polyline points={item.line}/>{item.coordinates.map(point => <circle key={`${point.replayId}-${item.kind}`} cx={point.x} cy={point.y} r="3"><title>{number.format(point.value)} {item.kind.toUpperCase()}</title></circle>)}</g>)}</svg><div className="match-axis"><span>{labels.firstMatch}</span><span>{labels.latestMatch} · {number.format(ordered.length)}</span></div></div></article>;
}

type CharacterRecord = ReturnType<typeof aggregateMatches>["bySubjectCharacter"][number];
function CharacterPanel({ eyebrow, title, records, matches, side, locale, recordLine }: { eyebrow: string; title: string; records: CharacterRecord[]; matches: BucklerBundlePreview["matches"]; side: "subject" | "opponent"; locale: "ja" | "en"; recordLine: (key: "recordLine", values: Record<string, number>) => string }) {
  return <article className="analysis-card character-panel is-roster"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><div className="character-records">{records.map(record => { const sample = matches.find(match => (match[side].playing_character_id ?? match[side].character_id) === record.characterId); const winRate = record.winRate ?? 0; return <div key={`${record.characterId}-${record.characterSlug}`}><span className="character-name">{sample ? getCharacterName(sample[side], locale) : record.characterName}</span><strong className="match-count">{record.matches}<small>{locale === "ja" ? "戦" : " matches"}</small></strong><small className="record-line">{recordLine("recordLine", { matches: record.matches, wins: record.wins, losses: record.losses })}</small><div className="win-rate"><i style={{ width: `${winRate}%` }} /><span>{formatWinRate(winRate)}</span></div></div>; })}</div></article>;
}
