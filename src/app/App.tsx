import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildBucklerLaunchUrl,
  CONNECTOR_PING_MESSAGE_TYPE,
  createCollectorStartMessage,
  readCollectorResultMessage,
  readCollectorStatusMessage,
  readConnectorReadyMessage,
} from "../collector/bridge";
import { availableActsForEpochs } from "../domain/buckler/acts";
import { getCharacterName, getCharacterNameBySlug } from "../domain/buckler/characterNames";
import { compareCharacterSlugs } from "../domain/buckler/characterOrder";
import { parseCollectorImport } from "../domain/buckler/parseCollectorBundle";
import { getRoundDetails } from "../domain/buckler/roundResults";
import {
  type BucklerBundlePreview,
  BucklerValidationError,
  type NormalizedMatch,
} from "../domain/buckler/types";
import {
  aggregateMatches,
  filterMatches,
  recentMatchSummary,
} from "../domain/statistics/aggregateMatches";
import { completeOpponentRoster } from "../domain/statistics/completeOpponentRoster";
import { recentRankedMatchupPriorities } from "../domain/statistics/matchupPriorities";
import { createSyncId } from "../domain/storage/createSyncId";
import { executeSyncPlan, type SyncProgress } from "../domain/storage/executeSyncPlan";
import { exportFirestoreArchive } from "../domain/storage/exportArchive";
import { hydrateMatchSides } from "../domain/storage/hydrateMatchSides";
import { loadStoredMatches, type StoredManifest } from "../domain/storage/loadStoredMatches";
import { mergeStoredMatches, summarizeStoredMerge } from "../domain/storage/mergeStoredMatches";
import { buildRestorePlan, executeRestorePlan } from "../domain/storage/restoreArchive";
import { getSyncFreshness, readLastSyncedAtEpoch } from "../domain/storage/syncFreshness";
import { buildSyncPlan } from "../domain/storage/syncPlan";
import { validateFirestoreArchive } from "../domain/storage/validateArchive";
import { deploymentConfig, firebaseRuntime } from "../firebase/client";
import { createFirestoreArchivePort } from "../firebase/firestoreArchivePort";
import { createFirestoreMatchSidePort } from "../firebase/firestoreMatchSidePort";
import { createFirestoreReadPort } from "../firebase/firestoreReadPort";
import { createFirestoreRestorePort } from "../firebase/firestoreRestorePort";
import { createFirestoreSyncPort } from "../firebase/firestoreSyncPort";
import { useAdminAuth } from "../firebase/useAdminAuth";
import { useI18n } from "../i18n/useI18n";
import { AdvancedInsights } from "./AdvancedInsights";
import { shouldAutoSyncCollectorBundle } from "./autoSync";
import { CharacterPanel } from "./CharacterPanel";
import { CollectionConsent } from "./CollectionConsent";
import { hasCollectionConsent, rememberCollectionConsent } from "./collectionConsentStorage";
import { isConnectorCompatible } from "./connectorVersions";
import { DailyTrend } from "./DailyTrend";
import { formatWinRate } from "./format";
import { ProfileHabitsPanel } from "./ProfileHabitsPanel";
import { RatingChart } from "./RatingChart";

const INITIAL_USER_CODE = deploymentConfig.playerUserCode;

interface ImportedBundle {
  fileName: string;
  fileSize: number;
  source: unknown;
  canSync: boolean;
  preview: BucklerBundlePreview;
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
  const ordered = [...matches].sort(
    (left, right) =>
      right.playedAtEpoch - left.playedAtEpoch || left.replayId.localeCompare(right.replayId),
  );
  const modes = [...new Set(ordered.map((match) => match.mode))];
  return {
    userCode: INITIAL_USER_CODE,
    pageCount: chunkCount,
    rawMatchCount: ordered.length,
    uniqueMatchCount: ordered.length,
    duplicateCount: 0,
    oldestPlayedAt: ordered.at(-1)?.playedAtEpoch,
    newestPlayedAt: ordered[0]?.playedAtEpoch,
    matches: ordered,
    sources: modes.map((sourceType) => ({
      sourceType,
      pages: 0,
      expectedPages: 0,
      rawMatches: ordered.filter((match) => match.mode === sourceType).length,
    })),
    warnings: [],
    isSinglePage: false,
  };
}

export function App() {
  const { locale, setLocale, t } = useI18n();
  const adminAuth = useAdminAuth(firebaseRuntime);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const adminMenuRef = useRef<HTMLDetailsElement>(null);
  const collectorTimeoutRef = useRef<number | null>(null);
  const [imported, setImported] = useState<ImportedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actId, setActId] = useState("");
  const [battleVersion, setBattleVersion] = useState("");
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
  const [connectorVersion, setConnectorVersion] = useState<string | null | undefined>(undefined);
  const [showConnectorGuide, setShowConnectorGuide] = useState(false);
  const [showCollectionConsent, setShowCollectionConsent] = useState(false);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tokyo",
      }),
    [locale],
  );
  const formatTimestamp = (timestamp?: number) =>
    timestamp === undefined ? "—" : dateTimeFormatter.format(new Date(timestamp * 1000));

  const filteredMatches = useMemo(
    () =>
      filterMatches(imported?.preview.matches ?? [], {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        actId: actId ? Number(actId) : undefined,
        battleVersion: battleVersion ? Number(battleVersion) : undefined,
        mode: mode ? (mode as BucklerBundlePreview["matches"][number]["mode"]) : undefined,
        subjectCharacterId: subjectCharacterId ? Number(subjectCharacterId) : undefined,
      }),
    [actId, battleVersion, fromDate, imported, mode, subjectCharacterId, toDate],
  );
  const statistics = useMemo(() => aggregateMatches(filteredMatches), [filteredMatches]);
  const allStatistics = useMemo(
    () => aggregateMatches(imported?.preview.matches ?? []),
    [imported],
  );
  const availableModes = useMemo(
    () =>
      [...new Set((imported?.preview.matches ?? []).map((match) => match.mode))].filter(
        (value) => value !== "all" && value !== "unknown",
      ),
    [imported],
  );
  const availableActs = useMemo(
    () =>
      availableActsForEpochs((imported?.preview.matches ?? []).map((match) => match.playedAtEpoch)),
    [imported],
  );
  const availableBattleVersions = useMemo(
    () =>
      [
        ...new Set(
          (imported?.preview.matches ?? []).flatMap((match) =>
            match.battleVersion === undefined ? [] : [match.battleVersion],
          ),
        ),
      ].sort((left, right) => right - left),
    [imported],
  );
  const opponentRecords = useMemo(
    () =>
      completeOpponentRoster(statistics.byOpponentCharacter, (slug) =>
        getCharacterNameBySlug(slug, locale),
      ),
    [locale, statistics.byOpponentCharacter],
  );
  const priorityMatchups = useMemo(
    () => recentRankedMatchupPriorities(filteredMatches),
    [filteredMatches],
  );
  const hasActiveFilters = Boolean(
    fromDate || toDate || actId || battleVersion || mode || subjectCharacterId,
  );
  const lastSyncedAtEpoch = readLastSyncedAtEpoch(storedManifest);
  const syncFreshness = getSyncFreshness(lastSyncedAtEpoch);
  const pendingMerge = useMemo(
    () =>
      imported?.canSync && archivedMatches !== null
        ? summarizeStoredMerge(archivedMatches, imported.preview.matches)
        : null,
    [archivedMatches, imported],
  );
  const authLabel =
    adminAuth.state.status === "disabled"
      ? t("localPreview")
      : adminAuth.state.status === "loading"
        ? t("firebaseConnecting")
        : adminAuth.state.status === "signedOut"
          ? t("firebaseSignedOut")
          : adminAuth.state.status === "admin"
            ? t("syncReady")
            : adminAuth.state.status === "notAdmin"
              ? t("notAdmin")
              : t("firebaseError");
  const connectorReady = isConnectorCompatible(connectorVersion, __CONNECTOR_VERSION__);

  useEffect(() => {
    if (
      firebaseRuntime.status !== "ready" ||
      (deploymentConfig.visibility !== "public" && adminAuth.state.status !== "admin") ||
      imported !== null
    )
      return;
    const db = firebaseRuntime.services.db;
    let active = true;
    setIsLoadingStored(true);
    void loadStoredMatches(createFirestoreReadPort(db), INITIAL_USER_CODE)
      .then((stored) => {
        if (!active) return;
        setArchivedMatches(stored?.matches ?? []);
        setStoredManifest(stored?.manifest ?? null);
        if (!stored) return;
        setImported({
          fileName: t("storedData"),
          fileSize: 0,
          source: null,
          canSync: false,
          preview: storedPreview(stored.matches, stored.manifest.chunks.length),
        });
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : t("storedLoadFailed"));
      })
      .finally(() => {
        if (active) setIsLoadingStored(false);
      });
    return () => {
      active = false;
    };
  }, [adminAuth.state.status, imported, t]);

  useEffect(() => {
    function receiveCollectorResult(event: MessageEvent) {
      const connector = readConnectorReadyMessage(event.origin, event.data, window.location.origin);
      if (connector) {
        setConnectorVersion(connector.version);
        return;
      }
      const status = readCollectorStatusMessage(event.origin, event.data, window.location.origin);
      if (status) {
        if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
        if (status.status === "started") {
          setError(null);
          collectorTimeoutRef.current = window.setTimeout(() => {
            collectorTimeoutRef.current = null;
            setIsCollecting(false);
            setError(t("collectorFetchTimeout"));
          }, 2 * 60_000);
          return;
        }
        if (status.status === "error") {
          collectorTimeoutRef.current = null;
          setIsCollecting(false);
          setError(t("collectorFailed", { message: status.message ?? t("errorUnexpected") }));
          return;
        }
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
        setImported({
          fileName: t("collectorTransfer"),
          fileSize: new Blob([JSON.stringify(message.bundle)]).size,
          source: message.bundle,
          canSync: true,
          preview,
        });
        setAutoSyncPending(true);
      } catch (cause) {
        setImported(null);
        setError(cause instanceof BucklerValidationError ? cause.message : t("errorUnexpected"));
      }
    }
    window.addEventListener("message", receiveCollectorResult);
    window.postMessage({ type: CONNECTOR_PING_MESSAGE_TYPE }, window.location.origin);
    const connectorDetectionTimeout = window.setTimeout(
      () => setConnectorVersion((version) => version ?? null),
      1_500,
    );
    return () => {
      window.removeEventListener("message", receiveCollectorResult);
      window.clearTimeout(connectorDetectionTimeout);
      if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
    };
  }, [t]);

  // synchronize intentionally reads the latest import and auth state after this one-shot gate opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adding the render-local function would rerun this effect on every render.
  useEffect(() => {
    if (
      !shouldAutoSyncCollectorBundle(
        autoSyncPending,
        imported?.canSync === true,
        adminAuth.state.status,
      )
    )
      return;
    setAutoSyncPending(false);
    void synchronize();
  }, [adminAuth.state.status, autoSyncPending, imported]);

  useEffect(() => {
    if (!syncMessage || syncProgress?.phase !== "complete") return;
    const timeout = window.setTimeout(() => setSyncMessage(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [syncMessage, syncProgress?.phase]);

  useEffect(() => {
    if (!restoreProgress || isRestoring) return;
    const timeout = window.setTimeout(() => setRestoreProgress(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [isRestoring, restoreProgress]);

  useEffect(() => {
    function closeAdminMenu(event: PointerEvent | KeyboardEvent) {
      const menu = adminMenuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") menu.open = false;
        return;
      }
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeAdminMenu);
    document.addEventListener("keydown", closeAdminMenu);
    return () => {
      document.removeEventListener("pointerdown", closeAdminMenu);
      document.removeEventListener("keydown", closeAdminMenu);
    };
  }, []);

  function openBuckler() {
    if (adminAuth.state.status !== "admin" || !connectorReady || isCollecting || isSyncing) return;
    const knownReplayIds = (archivedMatches ?? imported?.preview.matches ?? [])
      .slice(0, 20)
      .map((match) => match.replayId);
    const url = buildBucklerLaunchUrl(INITIAL_USER_CODE, window.location.origin, knownReplayIds);
    window.postMessage(createCollectorStartMessage(url), window.location.origin);
    setError(null);
    setIsCollecting(true);
    if (collectorTimeoutRef.current !== null) window.clearTimeout(collectorTimeoutRef.current);
    collectorTimeoutRef.current = window.setTimeout(() => {
      collectorTimeoutRef.current = null;
      setIsCollecting(false);
      setError(t("collectorStartTimeout"));
    }, 30_000);
  }

  function consentScope() {
    if (adminAuth.state.status !== "admin") return null;
    return {
      adminUid: adminAuth.state.user.uid,
      playerUserCode: INITIAL_USER_CODE,
      projectId: deploymentConfig.firebase?.projectId ?? "",
      visibility: deploymentConfig.visibility,
    };
  }

  function requestCollection() {
    const scope = consentScope();
    if (!scope) return;
    if (hasCollectionConsent(window.localStorage, scope)) openBuckler();
    else setShowCollectionConsent(true);
  }

  const connectorDownloadName = `sf6-battlegraph-connector-v${__CONNECTOR_VERSION__}.zip`;
  const connectorDownloadUrl = `./${connectorDownloadName}`;
  const connectorStoreUrl = deploymentConfig.connectorStoreId
    ? `https://chromewebstore.google.com/detail/${deploymentConfig.connectorStoreId}`
    : undefined;

  function resetFilters() {
    setFromDate("");
    setToDate("");
    setActId("");
    setBattleVersion("");
    setMode("");
    setSubjectCharacterId("");
  }

  async function synchronize() {
    if (
      !imported?.canSync ||
      firebaseRuntime.status !== "ready" ||
      adminAuth.state.status !== "admin"
    )
      return;
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncProgress(null);
    try {
      const id = createSyncId();
      const loaded =
        archivedMatches === null
          ? await loadStoredMatches(
              createFirestoreReadPort(firebaseRuntime.services.db),
              INITIAL_USER_CODE,
            )
          : null;
      const stored = archivedMatches ?? loaded?.matches ?? [];
      const previousManifest = storedManifest ?? loaded?.manifest;
      const summary = summarizeStoredMerge(stored, imported.preview.matches);
      const merged = mergeStoredMatches(stored, imported.preview.matches);
      const { matches: existing, hydratedCount } = await hydrateMatchSides(
        createFirestoreMatchSidePort(firebaseRuntime.services.db),
        INITIAL_USER_CODE,
        merged,
      );
      const plan = buildSyncPlan(
        imported.source,
        imported.preview,
        id,
        id,
        deploymentConfig.visibility,
        existing,
        previousManifest,
      );
      await executeSyncPlan(
        createFirestoreSyncPort(firebaseRuntime.services.db),
        plan,
        setSyncProgress,
      );
      setArchivedMatches(plan.storedMatches);
      setStoredManifest({
        ...(plan.manifest.data as unknown as StoredManifest),
        obsoleteChunkIds: [],
      });
      setImported({
        fileName: t("storedData"),
        fileSize: 0,
        source: null,
        canSync: false,
        preview: storedPreview(plan.storedMatches, (plan.manifest.data.chunks as unknown[]).length),
      });
      const completeMessage = t("syncComplete", {
        count: summary.totalMatches,
        newCount: summary.newMatches,
        refreshedCount: summary.refreshedMatches,
        retainedCount: summary.retainedMatches,
      });
      setSyncMessage(
        hydratedCount > 0
          ? `${completeMessage} ${t("sideMigrationComplete", { count: hydratedCount })}`
          : completeMessage,
      );
    } catch (cause) {
      setSyncMessage(cause instanceof Error ? cause.message : t("syncFailed"));
    } finally {
      setIsSyncing(false);
    }
  }

  async function exportBackup() {
    if (
      firebaseRuntime.status !== "ready" ||
      adminAuth.state.status !== "admin" ||
      !window.confirm(t("backupConfirm"))
    )
      return;
    setIsExporting(true);
    setError(null);
    try {
      const archive = validateFirestoreArchive(
        await exportFirestoreArchive(
          createFirestoreArchivePort(firebaseRuntime.services.db),
          INITIAL_USER_CODE,
        ),
      );
      const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sf6-battlegraph-backup-${INITIAL_USER_CODE}-${archive.exportedAt.replace(/[:.]/g, "-")}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("backupFailed"));
    } finally {
      setIsExporting(false);
    }
  }

  async function restoreBackup(file?: File) {
    if (!file || firebaseRuntime.status !== "ready" || adminAuth.state.status !== "admin") return;
    setError(null);
    setRestoreProgress(null);
    try {
      const plan = buildRestorePlan(
        JSON.parse(await file.text()) as unknown,
        INITIAL_USER_CODE,
        deploymentConfig.visibility,
      );
      if (!window.confirm(t("restoreConfirm", { count: plan.writeCount }))) return;
      setIsRestoring(true);
      setRestoreProgress(t("restoreProgress", { completed: 0, total: plan.writeCount }));
      await executeRestorePlan(
        createFirestoreRestorePort(firebaseRuntime.services.db),
        plan,
        (completed, total) => setRestoreProgress(t("restoreProgress", { completed, total })),
      );
      const stored = await loadStoredMatches(
        createFirestoreReadPort(firebaseRuntime.services.db),
        INITIAL_USER_CODE,
      );
      if (!stored) throw new Error(t("storedLoadFailed"));
      setArchivedMatches(stored.matches);
      setStoredManifest(stored.manifest);
      setImported({
        fileName: t("storedData"),
        fileSize: 0,
        source: null,
        canSync: false,
        preview: storedPreview(stored.matches, stored.manifest.chunks.length),
      });
      setRestoreProgress(t("restoreComplete", { count: plan.writeCount }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("restoreFailed"));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-leading">
          <a className="brand" href="#top">
            <span className="brand-mark">B</span>
            <span>
              <strong>{t("appName")}</strong>
              <small>{t("appTagline")}</small>
            </span>
          </a>
          {imported && (
            <div className="player-context">
              <span>
                {INITIAL_USER_CODE} · {t("latestBattle")}{" "}
                {formatTimestamp(imported.preview.newestPlayedAt)}
              </span>
              {lastSyncedAtEpoch !== undefined && (
                <span>
                  {t("lastSynced")} {formatTimestamp(lastSyncedAtEpoch)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          <span
            className={`status-pill auth-${adminAuth.state.status}`}
            title={adminAuth.state.status === "error" ? adminAuth.state.message : undefined}
          >
            <i /> {authLabel}
          </span>
          {adminAuth.state.status === "signedOut" && (
            <button className="auth-button" type="button" onClick={() => void adminAuth.signIn()}>
              {t("googleSignIn")}
            </button>
          )}
          {adminAuth.state.status === "admin" &&
            connectorVersion !== undefined &&
            connectorVersion !== __CONNECTOR_VERSION__ && (
              <a
                className="auth-button connector-update"
                href={connectorStoreUrl ?? connectorDownloadUrl}
                download={connectorStoreUrl ? undefined : connectorDownloadName}
                target={connectorStoreUrl ? "_blank" : undefined}
                rel={connectorStoreUrl ? "noopener noreferrer" : undefined}
                onClick={() => {
                  if (!connectorStoreUrl) setShowConnectorGuide(true);
                }}
              >
                {t(connectorVersion === null ? "connectorInstall" : "connectorUpdate")}
              </a>
            )}
          {adminAuth.state.status === "admin" && (
            <button
              className={`auth-button header-sync-button ${isCollecting || isSyncing ? "is-busy" : ""}`}
              type="button"
              disabled={isCollecting || isSyncing || !connectorReady}
              title={!connectorReady ? t("connectorRequired") : undefined}
              onClick={requestCollection}
            >
              {t(
                !connectorReady
                  ? "connectorRequired"
                  : isCollecting
                    ? "collectingFromBuckler"
                    : isSyncing
                      ? "syncing"
                      : "refreshFromBuckler",
              )}
            </button>
          )}
          {(adminAuth.state.status === "admin" || adminAuth.state.status === "notAdmin") && (
            <details ref={adminMenuRef} className="admin-menu">
              <summary aria-label={t("managementMenu")}>•••</summary>
              <div>
                <span>{t("managementMenu")}</span>
                {adminAuth.state.status === "admin" && connectorStoreUrl && (
                  <a href={connectorStoreUrl} target="_blank" rel="noopener noreferrer">
                    {t("connectorStore")}
                  </a>
                )}
                {adminAuth.state.status === "admin" && (
                  <a
                    href={connectorDownloadUrl}
                    download={connectorDownloadName}
                    onClick={() => setShowConnectorGuide(true)}
                  >
                    {t("connectorDownload")}
                  </a>
                )}
                {adminAuth.state.status === "admin" && (
                  <button type="button" disabled={isExporting} onClick={() => void exportBackup()}>
                    {isExporting ? t("backupExporting") : t("backupExport")}
                  </button>
                )}
                {adminAuth.state.status === "admin" && (
                  <button
                    type="button"
                    disabled={isRestoring}
                    onClick={() => restoreInputRef.current?.click()}
                  >
                    {isRestoring ? t("restoreRunning") : t("restoreBackup")}
                  </button>
                )}
                <button type="button" onClick={() => void adminAuth.signOut()}>
                  {t("signOut")}
                </button>
              </div>
            </details>
          )}
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void restoreBackup(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <nav className="language-switch" aria-label="Language">
            <button
              type="button"
              className={locale === "ja" ? "active" : ""}
              onClick={() => setLocale("ja")}
            >
              JP
            </button>
            <button
              type="button"
              className={locale === "en" ? "active" : ""}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="workspace">
          <div className="notification-stack" aria-live="polite">
            {showConnectorGuide && (
              <div className="message connector-guide" role="status">
                <button
                  type="button"
                  aria-label={t("close")}
                  onClick={() => setShowConnectorGuide(false)}
                >
                  ×
                </button>
                <strong>{t("connectorGuideTitle")}</strong>
                <ol>
                  <li>{t("connectorGuideExtract")}</li>
                  <li>{t("connectorGuideOpenExtensions")}</li>
                  <li>{t("connectorGuideLoad")}</li>
                  <li>{t("connectorGuideReload")}</li>
                </ol>
              </div>
            )}
            {syncFreshness &&
              syncFreshness.level !== "fresh" &&
              adminAuth.state.status === "admin" && (
                <div className={`message sync-reminder ${syncFreshness.level}`} role="status">
                  <strong>{t("syncReminderTitle")}</strong>
                  <span>{t("syncReminderDescription", { days: syncFreshness.days })}</span>
                </div>
              )}
            {isLoadingStored && (
              <div className="message" role="status">
                {t("loadingStored")}
              </div>
            )}
            {imported?.canSync && adminAuth.state.status === "admin" && (
              <div className="sync-bar">
                <div>
                  <p className="eyebrow">FIRESTORE</p>
                  <strong>{t("syncTitle")}</strong>
                  <span>
                    {syncProgress
                      ? `${syncProgress.completed} / ${syncProgress.total}`
                      : pendingMerge
                        ? t("syncPreview", {
                            count: pendingMerge.totalMatches,
                            newCount: pendingMerge.newMatches,
                            refreshedCount: pendingMerge.refreshedMatches,
                            retainedCount: pendingMerge.retainedMatches,
                          })
                        : t("syncDescription")}
                  </span>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={isSyncing}
                  onClick={() => void synchronize()}
                >
                  {isSyncing ? t("syncing") : t("syncNow")}
                </button>
              </div>
            )}
            {syncMessage && (
              <div
                className={`message ${syncProgress?.phase === "complete" ? "success" : "error"}`}
                role="status"
              >
                {syncMessage}
              </div>
            )}
            {restoreProgress && (
              <div className={`message ${isRestoring ? "" : "success"}`} role="status">
                {restoreProgress}
              </div>
            )}
            {error && (
              <div className="message error" role="alert">
                {error}
              </div>
            )}
          </div>

          {imported && (
            <section className="statistics-section">
              <article className="recent-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">{t("recentMatches")}</p>
                    <h3>{t("recentTitle")}</h3>
                  </div>
                  <span>{t("latestHundred")}</span>
                </div>
                <div className="table-wrap">
                  <table className="match-table">
                    <thead>
                      <tr>
                        <th>{t("dateTime")}</th>
                        <th>{t("result")}</th>
                        <th>{t("yourPlayer")}</th>
                        <th>{t("opponentPlayer")}</th>
                        <th>{t("mode")}</th>
                        <th>{t("replayId")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imported.preview.matches.slice(0, 100).map((match) => (
                        <tr key={match.replayId}>
                          <td>
                            <span className="primary-detail">
                              {formatTimestamp(match.playedAtEpoch)}
                            </span>
                          </td>
                          <td>
                            <span className={`result-badge ${match.result}`}>{match.result}</span>
                            <div className="round-details">
                              {getRoundDetails(
                                match.subject.round_results,
                                match.opponent.round_results,
                                locale,
                              ).map((round) => (
                                <span
                                  role="img"
                                  className={round.outcome}
                                  key={round.round}
                                  title={`R${round.round}: ${round.description}`}
                                  aria-label={`Round ${round.round}: ${round.outcome}, ${round.description}`}
                                >
                                  {round.method}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`side-badge side-${match.subjectSide ?? "unknown"}`}
                              title={
                                match.subjectSide === 1
                                  ? t("playerOne")
                                  : match.subjectSide === 2
                                    ? t("playerTwo")
                                    : t("sideUnknown")
                              }
                            >
                              {match.subjectSide ? `${match.subjectSide}P` : "?P"}
                            </span>
                            <strong className="character-detail">
                              {getCharacterName(match.subject, locale)}
                            </strong>
                            <small className="input-detail">
                              {getInputType(match.subject.battle_input_type)}
                            </small>
                            <small className="secondary-detail rating-detail">
                              {formatRating(match.subject)}
                            </small>
                          </td>
                          <td>
                            <strong className="character-detail">
                              {getCharacterName(match.opponent, locale)}
                            </strong>
                            <small className="input-detail">
                              {getInputType(match.opponent.battle_input_type)}
                            </small>
                            <small className="secondary-detail rating-detail">
                              {formatRating(match.opponent)}
                            </small>
                            {match.opponent.player.fighter_id && (
                              <small className="secondary-detail opponent-identity">
                                {match.opponent.player.fighter_id}
                              </small>
                            )}
                            {match.opponentPeak && (
                              <small
                                className="secondary-detail opponent-identity"
                                title={`Act ${match.opponentPeak.actId} · ${formatTimestamp(Date.parse(match.opponentPeak.fetchedAt) / 1000)}`}
                              >
                                {t("opponentPeak")} {match.opponentPeak.rating.toLocaleString()}
                                {" · "}
                                {getCharacterNameBySlug(
                                  match.opponentPeak.characterSlug,
                                  locale,
                                  match.opponentPeak.characterName,
                                )}
                              </small>
                            )}
                          </td>
                          <td>
                            <span className="primary-detail">
                              {match.battleTypeName ?? match.mode}
                            </span>
                          </td>
                          <td>
                            <code className="replay-code">{match.replayId}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <section className="analysis-zone">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">{t("localAnalysis")}</p>
                    <h2>{t("recordTitle")}</h2>
                  </div>
                  <div className="analysis-scope">
                    <strong>{t(hasActiveFilters ? "filteredScope" : "allTime")}</strong>
                    <span>
                      {t("showingMatches", {
                        shown: filteredMatches.length,
                        total: imported.preview.uniqueMatchCount,
                      })}
                    </span>
                  </div>
                </div>
                <div className="filter-bar">
                  <label>
                    <span>{t("fromDate")}</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("toDate")}</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                    />
                  </label>
                  {availableActs.length > 0 && (
                    <label>
                      <span>{t("act")}</span>
                      <select value={actId} onChange={(event) => setActId(event.target.value)}>
                        <option value="">{t("all")}</option>
                        {[...availableActs].reverse().map((act) => (
                          <option key={act.id} value={act.id}>
                            {t("actLabel", { id: act.id })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {availableBattleVersions.length > 1 && (
                    <label>
                      <span>{t("gameVersion")}</span>
                      <select
                        value={battleVersion}
                        onChange={(event) => setBattleVersion(event.target.value)}
                      >
                        <option value="">{t("all")}</option>
                        {availableBattleVersions.map((version) => (
                          <option key={version} value={version}>
                            {version}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span>{t("mode")}</span>
                    <select value={mode} onChange={(e) => setMode(e.target.value)}>
                      <option value="">{t("all")}</option>
                      {availableModes.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("yourCharacter")}</span>
                    <select
                      value={subjectCharacterId}
                      onChange={(e) => setSubjectCharacterId(e.target.value)}
                    >
                      <option value="">{t("all")}</option>
                      {[...allStatistics.bySubjectCharacter]
                        .sort((a, b) => compareCharacterSlugs(a.characterSlug, b.characterSlug))
                        .filter((r) => r.characterId !== null)
                        .map((r) => {
                          const sample = imported.preview.matches.find(
                            (m) =>
                              (m.subject.playing_character_id ?? m.subject.character_id) ===
                              r.characterId,
                          );
                          return (
                            <option key={r.characterId} value={r.characterId ?? ""}>
                              {sample ? getCharacterName(sample.subject, locale) : r.characterName}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                  <button type="button" onClick={resetFilters}>
                    {t("reset")}
                  </button>
                </div>
                <div className="analysis-overview">
                  <div className="record-banner">
                    <article>
                      <span>{t("winRate")}</span>
                      <strong>{formatWinRate(statistics.overall.winRate)}</strong>
                    </article>
                    {statistics.bySide.map((record) => (
                      <article key={record.side}>
                        <span>
                          {t(record.side === 1 ? "playerOneWinRate" : "playerTwoWinRate")}
                        </span>
                        <strong>{formatWinRate(record.winRate)}</strong>
                        <small>
                          {t("sideRecord", { wins: record.wins, matches: record.matches })}
                        </small>
                      </article>
                    ))}
                    <article>
                      <span>{t("wins")}</span>
                      <strong>{statistics.overall.wins}</strong>
                    </article>
                    <article>
                      <span>{t("losses")}</span>
                      <strong>{statistics.overall.losses}</strong>
                    </article>
                    <article>
                      <span>{t("undecided")}</span>
                      <strong>{statistics.overall.unknown + statistics.overall.draws}</strong>
                    </article>
                  </div>
                  <section className="recent-form ui-card" aria-label={t("recentForm")}>
                    <div className="recent-form-heading">
                      <h3 className="ui-title">{t("recentForm")}</h3>
                      <span>
                        {locale === "ja"
                          ? "絞込後 · 勝率は勝敗のみ"
                          : "Filtered · decided games only"}
                      </span>
                    </div>
                    <div className="recent-form-grid">
                      {[10, 100].map((limit) => {
                        const record = recentMatchSummary(filteredMatches, limit);
                        return (
                          <article className="recent-form-card" key={limit}>
                            <span className="ui-label">
                              {t("recentGames", { limit, count: record.matches })}
                            </span>
                            <strong className="ui-value ui-value--accent">
                              {formatWinRate(record.winRate)}
                            </strong>
                            <small className="ui-note">
                              {t("recentRecord", {
                                wins: record.wins,
                                losses: record.losses,
                                other: record.draws + record.unknown,
                              })}
                            </small>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </div>
                <div className="analysis-trends">
                  <RatingChart
                    matches={filteredMatches}
                    allMatches={imported.preview.matches}
                    currentRatings={storedManifest?.currentRatings ?? null}
                    allowCurrent={!toDate && !actId && !battleVersion}
                    locale={locale}
                    labels={{
                      eyebrow: t("ratingHistory"),
                      title: t("ratingChartTitle"),
                      character: t("ratingCharacter"),
                      latest: t("latestRating"),
                      highest: t("highestRating"),
                      lowest: t("lowestRating"),
                      change: t("ratingChange"),
                      noData: t("noRatingData"),
                      firstMatch: t("firstMatch"),
                      latestMatch: t("latestMatch"),
                    }}
                  />
                  <DailyTrend
                    records={statistics.byDay}
                    locale={locale}
                    labels={{
                      eyebrow: t("dailyTrend"),
                      title: t("dailyTrendTitle"),
                      matches: t("dailyMatches"),
                      winRate: t("winRate"),
                      wins: t("wins"),
                      losses: t("losses"),
                      other: t("dailyOther"),
                      noMatches: t("dailyNoMatches"),
                      empty: t("noRecords"),
                      activeDays: (count) => t("activeDays", { count }),
                    }}
                  />
                </div>
                <div className="character-sections">
                  <CharacterPanel
                    eyebrow={t("yourFighters")}
                    title={t("yourCharacterRecords")}
                    records={statistics.bySubjectCharacter}
                    matches={filteredMatches}
                    side="subject"
                    locale={locale}
                    recordLine={t}
                  />
                  <CharacterPanel
                    eyebrow={t("matchups")}
                    title={t("opponentCharacterRecords")}
                    records={opponentRecords}
                    matches={filteredMatches}
                    side="opponent"
                    locale={locale}
                    recordLine={t}
                    matchupSearchLabel={t("matchupSearch")}
                    priorityMatchups={priorityMatchups}
                    priorityTitle={t("matchupPriorities")}
                    priorityDescription={t("matchupPriorityDescription")}
                    priorityEmpty={t("matchupPriorityEmpty")}
                  />
                </div>
                <AdvancedInsights matches={filteredMatches} locale={locale} />
                {firebaseRuntime.status === "ready" && (
                  <ProfileHabitsPanel
                    key={storedManifest?.sourceSyncId ?? "initial"}
                    db={firebaseRuntime.services.db}
                    userCode={INITIAL_USER_CODE}
                    locale={locale}
                    matches={imported.preview.matches}
                  />
                )}
              </section>
            </section>
          )}
          {!imported && !isLoadingStored && adminAuth.state.status === "admin" && (
            <section className="empty-state">
              <p className="eyebrow">{t("noStoredData")}</p>
              <h2>{t("noStoredDataTitle")}</h2>
              <p>{t("noStoredDataDescription")}</p>
              <button
                className="primary-button"
                type="button"
                disabled={!connectorReady}
                title={!connectorReady ? t("connectorRequired") : undefined}
                onClick={requestCollection}
              >
                {t(connectorReady ? "refreshFromBuckler" : "connectorRequired")}
              </button>
            </section>
          )}
        </section>
      </main>
      <footer>
        <span>{t("appName")}</span>
        <span>{t("unofficial")}</span>
      </footer>
      {showCollectionConsent && (
        <CollectionConsent
          locale={locale}
          visibility={deploymentConfig.visibility}
          onCancel={() => setShowCollectionConsent(false)}
          onAgree={() => {
            setShowCollectionConsent(false);
            const scope = consentScope();
            if (!scope) return;
            rememberCollectionConsent(window.localStorage, scope);
            openBuckler();
          }}
        />
      )}
    </div>
  );
}
