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
import { advancedInsights } from "../domain/statistics/advancedInsights";
import {
  aggregateMatches,
  filterMatches,
  recentMatchSummary,
} from "../domain/statistics/aggregateMatches";
import { completeOpponentRoster } from "../domain/statistics/completeOpponentRoster";
import { buildDailyWindow } from "../domain/statistics/dailyWindow";
import { recentRankedMatchupPriorities } from "../domain/statistics/matchupPriorities";
import { movingAverage } from "../domain/statistics/movingAverage";
import type { ProfileHabits } from "../domain/statistics/profileHabits";
import {
  latestRatingCharacterKey,
  ratingCharacterKey,
  ratingMatches,
} from "../domain/statistics/ratingMatches";
import { ratingScale } from "../domain/statistics/ratingScale";
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
import { loadProfileHabits } from "../firebase/loadProfileHabits";
import { useAdminAuth } from "../firebase/useAdminAuth";
import { useI18n } from "../i18n/useI18n";
import { shouldAutoSyncCollectorBundle } from "./autoSync";
import { CollectionConsent } from "./CollectionConsent";
import { hasCollectionConsent, rememberCollectionConsent } from "./collectionConsentStorage";
import { isConnectorCompatible } from "./connectorVersions";

const INITIAL_USER_CODE = deploymentConfig.playerUserCode;

interface ImportedBundle {
  fileName: string;
  fileSize: number;
  source: unknown;
  canSync: boolean;
  preview: BucklerBundlePreview;
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

function ProfileHabitsPanel({
  db,
  userCode,
  locale,
}: {
  db: import("firebase/firestore/lite").Firestore;
  userCode: number;
  locale: "ja" | "en";
}) {
  const [snapshots, setSnapshots] = useState<ProfileHabits[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ja = locale === "ja";
  const fields = [
    ["drive_impact", ja ? "ドライブインパクト" : "Drive impact"],
    ["drive_parry", ja ? "ドライブパリィ" : "Drive parry"],
    ["just_parry", ja ? "ジャストパリィ" : "Perfect parry"],
    ["throw_count", ja ? "投げ" : "Throws"],
    ["corner_time", ja ? "相手を画面端に追い詰めた時間" : "Corner time"],
  ] as const;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadProfileHabits(db, userCode)
      .then((value) => {
        if (active) setSnapshots(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unknown error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db, userCode]);
  return (
    <section className="insights-card habits-card ui-card">
      <p className="eyebrow">PLAYSTYLE SNAPSHOT</p>
      <h3 className="ui-title">{ja ? "プレイ傾向の変化" : "Playstyle changes"}</h3>
      <span className="insights-caption">
        {ja ? "直近100戦平均 · フィルター対象外" : "Last 100 games · unfiltered"}
      </span>
      {loading && <p role="status">{ja ? "読み込み中…" : "Loading…"}</p>}
      {error && (
        <p role="alert">
          {ja ? "プロフィール記録を読み込めませんでした" : "Unable to load profile snapshots"}:{" "}
          {error}
        </p>
      )}
      {snapshots &&
        (snapshots.length ? (
          <>
            <small>
              {ja
                ? "取得時点の値。前回との差は期間内だけの成績ではありません。"
                : "Snapshot differences are not period-only statistics."}
            </small>
            {snapshots.map((snapshot, index) => (
              <p key={snapshot.fetchedAt}>
                {index === 0 ? (ja ? "今回" : "Latest") : ja ? "前回" : "Previous"}:{" "}
                {new Date(snapshot.fetchedAt).toLocaleString(ja ? "ja-JP" : "en-US", {
                  timeZone: "Asia/Tokyo",
                })}
              </p>
            ))}
            <div className="habits-grid">
              {fields.map(([key, label]) => {
                const value = snapshots[0]?.values[key],
                  previous = snapshots[1]?.values[key];
                return (
                  <article key={key}>
                    <span className="ui-label">{label}</span>
                    <strong className="ui-value ui-value--accent">{value ?? "—"}</strong>
                    {value !== undefined && previous !== undefined ? (
                      <small>
                        {ja ? "前回比" : "Change"} {value - previous >= 0 ? "+" : ""}
                        {(value - previous).toFixed(1)}
                      </small>
                    ) : (
                      ""
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <p>{ja ? "対象のプロフィール記録がありません。" : "No profile snapshots found."}</p>
        ))}
    </section>
  );
}

function AdvancedInsights({
  matches,
  locale,
}: {
  matches: NormalizedMatch[];
  locale: "ja" | "en";
}) {
  const data = useMemo(() => advancedInsights(matches), [matches]);
  const ja = locale === "ja";
  const summary = (record: ReturnType<typeof recentMatchSummary>) =>
    `${formatWinRate(record.winRate)} (${record.wins}–${record.losses}; n=${record.matches})`;
  const statRow = (label: string, item: ReturnType<typeof recentMatchSummary>) => (
    <div className="insight-row">
      <span>{label}</span>
      <strong>{formatWinRate(item.winRate)}</strong>
      <small>
        {item.wins}–{item.losses} · n={item.matches}
      </small>
    </div>
  );
  const record = (items: NormalizedMatch[]) => recentMatchSummary(items, items.length);
  const days = ja
    ? ["日", "月", "火", "水", "木", "金", "土"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourLabels = Array.from({ length: 24 }, (_, hour) => String((hour + 6) % 24));
  const gameLabels = ja ? ["1試合目", "2試合目", "3試合目"] : ["Game 1", "Game 2", "Game 3"];
  return (
    <section className="insights-card ui-card">
      <p className="eyebrow">MATCH INSIGHTS</p>
      <h3 className="insights-title ui-title">
        {ja
          ? "詳細分析：ラウンド・対戦相手・時間帯"
          : "Detailed analysis: rounds, opponents and time"}
      </h3>
      <span className="insights-caption">
        {ja ? "絞込後 · 勝率は勝敗のみ" : "Filtered · decided games only"}
      </span>
      <div className="insights-grid">
        <section>
          <h4>{ja ? "ラウンド成績" : "Round record"}</h4>
          <p>
            {ja ? "取得率" : "Win rate"}:{" "}
            {formatWinRate(
              data.rounds.won + data.rounds.lost
                ? (data.rounds.won * 100) / (data.rounds.won + data.rounds.lost)
                : null,
            )}
          </p>
          <p>
            {data.rounds.won}–{data.rounds.lost} · {ja ? "得失差" : "Difference"}{" "}
            {data.rounds.won - data.rounds.lost >= 0 ? "+" : ""}
            {data.rounds.won - data.rounds.lost}
          </p>
          <small>
            {ja ? "両者のラウンド記録が揃った試合のみ" : "Only matches with both round records"}
          </small>
        </section>
        <section>
          <h4>{ja ? "ラウンド先取と接戦" : "First round and close games"}</h4>
          {statRow(ja ? "先取" : "Won first", record(data.rounds.firstWon))}
          {statRow(ja ? "先取された" : "Lost first", record(data.rounds.firstLost))}
          {statRow(
            ja ? "3ラウンド接戦（推定）" : "Three-round close games (estimated)",
            record(data.rounds.deciding),
          )}
        </section>
        <section>
          <h4>{ja ? "相手MR帯" : "Opponent MR"}</h4>
          {data.bands.length ? (
            data.bands.map(({ band, record: item }) => (
              <div key={band}>{statRow(`${band}–${band + 99}`, item)}</div>
            ))
          ) : (
            <p>—</p>
          )}
          <small>
            {ja
              ? "履歴に記録されたMR。試合前後の時点は未検証"
              : "Recorded MR; pre/post-match timing unverified"}
          </small>
        </section>
        <section>
          <h4>{ja ? "MR差別" : "Relative MR"}</h4>
          {(ja
            ? ["相手が50以上低い", "差±49", "相手が50以上高い"]
            : ["Opponent −50 or less", "Within ±49", "Opponent +50 or more"]
          ).map((label, i) => (
            <div key={label}>{statRow(label, data.relative[i])}</div>
          ))}
        </section>
        <section>
          <h4>{ja ? "対面：遭遇数と勝率" : "Matchups: frequency and win rate"}</h4>
          <svg
            className="insights-scatter"
            viewBox="0 0 400 160"
            role="img"
            aria-label={
              ja ? "横軸は勝率、縦軸は対戦数" : "Horizontal axis: win rate; vertical axis: matches"
            }
          >
            <line x1="20" y1="140" x2="390" y2="140" stroke="#747b84" />
            <line x1="205" y1="10" x2="205" y2="140" stroke="#747b84" strokeDasharray="4 4" />
            {data.matchups
              .filter((item) => item.winRate !== null)
              .map((item) => (
                <circle
                  key={`${item.characterId}-${item.characterSlug}`}
                  cx={20 + (item.winRate ?? 0) * 3.7}
                  cy={
                    140 -
                    (item.matches / Math.max(1, ...data.matchups.map((entry) => entry.matches))) *
                      125
                  }
                  r="5"
                  fill="#c7ff4a"
                >
                  <title>
                    {item.characterName}: {summary(item)}
                  </title>
                </circle>
              ))}
          </svg>
          <small>
            {ja
              ? "横：勝率 0–100% ／ 縦：対戦数（多いほど上）"
              : "Horizontal: win rate 0–100%; vertical: number of matches"}
          </small>
          {data.matchups.slice(0, 10).map((item) => (
            <div key={item.characterSlug}>{statRow(item.characterName, item)}</div>
          ))}
          <small>
            {ja
              ? "遭遇数の多い順。少数の結果は変動しやすい"
              : "Most frequent first; small samples vary widely"}
          </small>
        </section>
        <section>
          <h4>{ja ? "同じ相手との連戦（推定）" : "Consecutive games (estimated)"}</h4>
          {gameLabels.map((label, i) => (
            <div key={label}>{statRow(label, data.sessions[i])}</div>
          ))}
          <small>
            {ja
              ? "同一相手・同一モード・前試合から10分以内。履歴欠落やキャラ変更は考慮しません。"
              : "Same opponent and mode within 10 minutes; missing history and character changes are not accounted for."}
          </small>
        </section>
      </div>
      <section className="insights-time">
        <h4>
          {ja ? "曜日・時間帯別の勝率" : "Win rate by weekday and hour"}{" "}
          <span className="ui-note">
            {ja ? "（日本時間・6時始まり）" : "(Japan time · from 06:00)"}
          </span>
        </h4>
        <span className="ui-note">
          {ja
            ? "勝率と試合数 · 勝敗判明5戦未満は薄く表示 · 曜日は暦日"
            : "Win rate and games · fewer than five decided games are muted · calendar weekdays"}
        </span>
        <div className="insights-scroll">
          <table>
            <thead>
              <tr>
                <th>{ja ? "曜日" : "Day"}</th>
                {hourLabels.map((hour) => (
                  <th key={hour}>{hour}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, dayIndex) => (
                <tr key={day}>
                  <th>{day}</th>
                  {hourLabels.map((hour) => {
                    const item = data.weekdays[dayIndex][Number(hour)];
                    return (
                      <td
                        key={hour}
                        className={item.wins + item.losses < 5 ? "heatmap-low-sample" : ""}
                        title={`${days[dayIndex]} ${hour}:00 · ${summary(item)} · ${ja ? "引分・不明" : "draw / unknown"}: ${item.draws + item.unknown}`}
                        style={{
                          backgroundColor:
                            item.winRate === null
                              ? undefined
                              : item.winRate >= 50
                                ? `rgba(199, 255, 74, ${0.12 + (item.winRate - 50) / 200})`
                                : `rgba(255, 118, 95, ${0.12 + (50 - item.winRate) / 200})`,
                        }}
                      >
                        {item.winRate === null ? "–" : `${Math.round(item.winRate)}%`}
                        {item.matches > 0 && (
                          <small>
                            {item.matches}
                            {ja ? "戦" : "g"}
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="hourly-chart-title">
          {ja ? "時間別勝率" : "Win rate by hour"}{" "}
          <span className="ui-note">{ja ? "（全曜日）" : "(all weekdays)"}</span>
        </h4>
        <div className="hourly-scroll">
          <ul
            className="hourly-chart"
            aria-label={ja ? "全曜日を合算した時間別勝率" : "Win rates by hour across all weekdays"}
          >
            {hourLabels.map((hour) => {
              const item = data.hours[Number(hour)];
              const lowSample = item.wins + item.losses < 10;
              return (
                <li
                  className={`hourly-column${lowSample ? " hourly-low-sample" : ""}`}
                  key={hour}
                  aria-label={`${hour}:00 · ${summary(item)}${lowSample ? (ja ? " · 参考不足" : " · small sample") : ""}`}
                >
                  <span className="hourly-value">
                    {item.winRate === null ? "–" : `${Math.round(item.winRate)}%`}
                  </span>
                  <div className="hourly-track">
                    <i style={{ height: `${item.winRate ?? 0}%` }} />
                  </div>
                  <strong>{hour}</strong>
                  <small>
                    {item.matches}
                    {ja ? "戦" : "g"}
                  </small>
                </li>
              );
            })}
          </ul>
        </div>
        <small className="ui-note">
          {ja
            ? "薄い棒は勝敗判明10戦未満。数字は勝率と対戦数です。"
            : "Muted bars have fewer than 10 decided games; labels show win rate and games."}
        </small>
      </section>
    </section>
  );
}

type DailyRecord = ReturnType<typeof aggregateMatches>["byDay"][number];
function DailyTrend({
  records,
  locale,
  labels,
}: {
  records: DailyRecord[];
  locale: "ja" | "en";
  labels: Record<
    | "eyebrow"
    | "title"
    | "matches"
    | "winRate"
    | "wins"
    | "losses"
    | "other"
    | "noMatches"
    | "empty",
    string
  > & {
    activeDays: (count: number) => string;
  };
}) {
  const recent = buildDailyWindow(records, 14);
  const date = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  const trendSegments: string[][] = [];
  let segment: string[] = [];
  for (const [index, record] of recent.entries()) {
    if (record.winRate === null) {
      if (segment.length) trendSegments.push(segment);
      segment = [];
    } else segment.push(`${30 + index * 40},${110 - record.winRate}`);
  }
  if (segment.length) trendSegments.push(segment);
  return (
    <article className="daily-card ui-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h3 className="ui-title">{labels.title}</h3>
        </div>
        <span>{recent.length ? labels.activeDays(recent.length) : labels.empty}</span>
      </div>
      {recent.length > 0 && (
        <>
          <div className="daily-trend-chart">
            <p>
              {locale === "ja"
                ? "日別勝率の推移（試合なし・勝敗不明の日は途切れます）"
                : "Daily win rate (gaps indicate no decided games)"}
            </p>
            <svg
              viewBox="0 0 590 140"
              role="img"
              aria-label={locale === "ja" ? "日別勝率の推移" : "Daily win-rate trend"}
              preserveAspectRatio="xMidYMid meet"
            >
              {[0, 50, 100].map((value) => (
                <g key={value}>
                  <line
                    x1="30"
                    x2="570"
                    y1={110 - value}
                    y2={110 - value}
                    stroke="#454c55"
                    strokeDasharray="4 4"
                  />
                  <text x="0" y={114 - value}>
                    {value}%
                  </text>
                </g>
              ))}
              {trendSegments.map((points) => (
                <polyline
                  key={points[0]}
                  points={points.join(" ")}
                  fill="none"
                  stroke="#c7ff4a"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {recent.map((item, index) =>
                item.winRate === null ? null : (
                  <circle
                    key={item.date}
                    cx={30 + index * 40}
                    cy={110 - item.winRate}
                    r="3"
                    fill="#c7ff4a"
                  >
                    <title>
                      {item.date}: {formatWinRate(item.winRate)} ({item.matches} {labels.matches})
                    </title>
                  </circle>
                ),
              )}
              <text x="30" y="135">
                {recent[0]?.date.slice(5)}
              </text>
              <text x="570" y="135" textAnchor="end">
                {recent.at(-1)?.date.slice(5)}
              </text>
            </svg>
          </div>
          <details className="daily-detail-toggle">
            <summary>{locale === "ja" ? "日ごとの内訳" : "Daily breakdown"}</summary>
            <div className="daily-legend" aria-hidden="true">
              <span className="daily-key-win">{labels.wins}</span>
              <span className="daily-key-loss">{labels.losses}</span>
              <span className="daily-key-other">{labels.other}</span>
            </div>
            <div className="daily-grid">
              {recent.map((record) => {
                const other = record.draws + record.unknown;
                return (
                  <div className="daily-day" key={record.date}>
                    <div className="daily-day-heading">
                      <time dateTime={record.date}>
                        {date.format(new Date(`${record.date}T00:00:00+09:00`))}
                      </time>
                      <span>
                        {record.matches} {labels.matches}
                      </span>
                    </div>
                    {record.matches ? (
                      <>
                        <div className="daily-result-bar" aria-hidden="true">
                          <i className="daily-win" style={{ flexGrow: record.wins }} />
                          <i className="daily-loss" style={{ flexGrow: record.losses }} />
                          <i className="daily-other" style={{ flexGrow: other }} />
                        </div>
                        <div className="daily-result-detail">
                          <span>
                            {labels.wins} {record.wins} · {labels.losses} {record.losses}
                            {other > 0 ? ` · ${labels.other} ${other}` : ""}
                          </span>
                          <strong>
                            {labels.winRate} {formatWinRate(record.winRate)}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <p className="daily-empty">{labels.noMatches}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}
    </article>
  );
}

function RatingChart({
  matches,
  allMatches,
  currentRatings,
  allowCurrent,
  locale,
  labels,
}: {
  matches: BucklerBundlePreview["matches"];
  allMatches: NormalizedMatch[];
  currentRatings: StoredManifest["currentRatings"];
  allowCurrent: boolean;
  locale: "ja" | "en";
  labels: Record<
    | "eyebrow"
    | "title"
    | "character"
    | "latest"
    | "highest"
    | "lowest"
    | "change"
    | "noData"
    | "firstMatch"
    | "latestMatch",
    string
  >;
}) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const characterGroups = new Map<string, BucklerBundlePreview["matches"]>();
  for (const match of ratingMatches(matches)) {
    const key = ratingCharacterKey(match);
    characterGroups.set(key, [...(characterGroups.get(key) ?? []), match]);
  }
  const characters = [...characterGroups.entries()].sort(
    (left, right) =>
      right[1].length - left[1].length ||
      compareCharacterSlugs(
        left[1][0]?.subject.playing_character_tool_name ??
          left[1][0]?.subject.character_tool_name ??
          "unknown",
        right[1][0]?.subject.playing_character_tool_name ??
          right[1][0]?.subject.character_tool_name ??
          "unknown",
      ),
  );
  const effectiveCharacter = characters.some(([key]) => key === selectedCharacter)
    ? selectedCharacter
    : latestRatingCharacterKey(matches);
  const chartMatches = characterGroups.get(effectiveCharacter) ?? [];
  const ordered = [...chartMatches].sort((a, b) => a.playedAtEpoch - b.playedAtEpoch).slice(-100);
  const allCharacterMatches = ratingMatches(allMatches).filter(
    (match) => ratingCharacterKey(match) === effectiveCharacter,
  );
  const chronologicalHistory = [...allCharacterMatches].sort(
    (a, b) => a.playedAtEpoch - b.playedAtEpoch,
  );
  const latestAll = [...allCharacterMatches].sort((a, b) => b.playedAtEpoch - a.playedAtEpoch)[0];
  const latestShown = ordered.at(-1);
  const snapshotRating =
    allowCurrent &&
    latestShown &&
    latestAll?.replayId === latestShown.replayId &&
    currentRatings &&
    Date.parse(currentRatings.fetchedAt) / 1000 >= latestShown.playedAtEpoch
      ? currentRatings.ratings.find((rating) => `id:${rating.characterId}` === effectiveCharacter)
      : undefined;
  const number = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US");
  const width = 1000,
    height = 230,
    padX = 22,
    padY = 18;
  function series(kind: "lp" | "mr") {
    const averages = movingAverage(
      chronologicalHistory.map((match) => {
        const value = kind === "lp" ? match.subject.league_point : match.subject.master_rating;
        return typeof value === "number" && value > 0 ? value : null;
      }),
      10,
    );
    const averagesByReplay = new Map(
      chronologicalHistory.map((match, index) => [match.replayId, averages[index]]),
    );
    const points = ordered
      .map((match, matchIndex) => ({
        match,
        matchIndex,
        value: kind === "lp" ? match.subject.league_point : match.subject.master_rating,
      }))
      .filter(
        (point): point is { match: (typeof ordered)[number]; matchIndex: number; value: number } =>
          (point.value ?? 0) > 0,
      );
    const currentValue = kind === "lp" ? snapshotRating?.leaguePoint : snapshotRating?.masterRating;
    if (currentValue && latestShown)
      points.push({ match: latestShown, matchIndex: ordered.length, value: currentValue });
    if (!points.length) return null;
    const values = points.map((point) => point.value);
    const highest = Math.max(...values),
      lowest = Math.min(...values);
    const scaleValues = chronologicalHistory
      .slice(-100)
      .map((match) => (kind === "lp" ? match.subject.league_point : match.subject.master_rating))
      .filter((value): value is number => typeof value === "number" && value > 0);
    const current = currentRatings?.ratings.find(
      (rating) => `id:${rating.characterId}` === effectiveCharacter,
    );
    const currentScaleValue = kind === "lp" ? current?.leaguePoint : current?.masterRating;
    if (currentScaleValue && currentScaleValue > 0) scaleValues.push(currentScaleValue);
    for (const match of ordered) {
      const average = averagesByReplay.get(match.replayId);
      if (average != null) scaleValues.push(average);
    }
    const { min, max, step } = ratingScale([...scaleValues, ...values], kind === "lp" ? 100 : 10);
    const y = (value: number) => padY + ((max - value) * (height - padY * 2)) / (max - min);
    const coordinates = points.map((point) => ({
      x:
        padX +
        (ordered.length === 1 && !currentValue
          ? (width - padX * 2) / 2
          : (point.matchIndex * (width - padX * 2)) /
            (ordered.length - 1 + (currentValue ? 1 : 0))),
      y: y(point.value),
      value: point.value,
      replayId: point.match.replayId,
      snapshot: point.matchIndex === ordered.length,
    }));
    const averageSegments: string[][] = [];
    {
      let segment: string[] = [];
      for (let index = 0; index < ordered.length; index++) {
        const average = averagesByReplay.get(ordered[index].replayId);
        const coordinate = coordinates.find(
          (point) => !point.snapshot && point.replayId === ordered[index].replayId,
        );
        if (average == null || !coordinate) {
          if (segment.length) averageSegments.push(segment);
          segment = [];
        } else segment.push(`${coordinate.x},${y(average)}`);
      }
      if (segment.length) averageSegments.push(segment);
    }
    const ticks = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => ({
      value: min + index * step,
      y: y(min + index * step),
    }));
    return {
      kind,
      coordinates,
      ticks,
      line: coordinates.map((point) => `${point.x},${point.y}`).join(" "),
      averageSegments,
      latest: values.at(-1) as number,
      highest,
      lowest,
      change: (values.at(-1) as number) - values[0],
    };
  }
  const lp = series("lp"),
    mr = series("mr"),
    seriesList = [lp, mr].filter((item): item is NonNullable<typeof item> => item !== null);
  const characterSelector = characters.length > 1 && (
    <label className="rating-character-select">
      <span>{labels.character}</span>
      <select
        value={effectiveCharacter}
        onChange={(event) => setSelectedCharacter(event.target.value)}
      >
        {characters.map(([key, characterMatches]) => (
          <option key={key} value={key}>
            {getCharacterName(characterMatches[0].subject, locale)}
          </option>
        ))}
      </select>
    </label>
  );
  if (!seriesList.length)
    return (
      <article className="lp-card ui-card">
        <div className="lp-heading">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h3 className="ui-title">{labels.title}</h3>
          </div>
          {characterSelector}
        </div>
        <p className="lp-empty">{labels.noData}</p>
      </article>
    );
  return (
    <article className="lp-card ui-card">
      <div className="lp-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h3 className="ui-title">{labels.title}</h3>
          <span className="rating-line-key">
            {locale === "ja"
              ? "実線：実績 · 破線：10試合平均"
              : "Solid: recorded · dashed: 10-game average"}
          </span>
        </div>
        <div className="rating-controls">
          {characterSelector}
          <div className="rating-metrics">
            {([lp, mr] as const).map((item, index) => (
              <div className={`rating-summary ${index ? "mr" : "lp"}`} key={index ? "mr" : "lp"}>
                <b>{index ? "MR" : "LP"}</b>
                {item ? (
                  <>
                    <span>
                      {labels.latest}
                      <strong>{number.format(item.latest)}</strong>
                      {item.coordinates.at(-1)?.snapshot && (
                        <small className="rating-snapshot">
                          {locale === "ja" ? "（同期時点）" : " (at sync)"}
                        </small>
                      )}
                    </span>
                    <small>
                      {labels.highest} {number.format(item.highest)} · {labels.lowest}{" "}
                      {number.format(item.lowest)} · {labels.change}{" "}
                      <em className={item.change >= 0 ? "positive" : "negative"}>
                        {item.change >= 0 ? "+" : ""}
                        {number.format(item.change)}
                      </em>
                    </small>
                  </>
                ) : (
                  <small>{labels.noData}</small>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="lp-chart">
        {seriesList.flatMap((item) =>
          item.ticks.map((tick) => (
            <span
              className={`rating-tick ${item.kind}`}
              style={{ top: `${(tick.y / height) * 100}%` }}
              key={`${item.kind}-${tick.value}`}
            >
              {number.format(tick.value)}
            </span>
          )),
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={labels.title}
          preserveAspectRatio="none"
        >
          {seriesList.flatMap((item) =>
            item.ticks.map((tick) => (
              <line
                x1={padX}
                y1={tick.y}
                x2={width - padX}
                y2={tick.y}
                className={`grid-line ${item.kind}`}
                key={`${item.kind}-${tick.value}`}
              />
            )),
          )}
          {seriesList.map((item) => (
            <g className={`rating-series ${item.kind}`} key={item.kind}>
              <polyline points={item.line} />
              {item.coordinates.map((point) => (
                <circle
                  key={`${point.replayId}-${item.kind}-${point.snapshot}`}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                >
                  <title>
                    {number.format(point.value)} {item.kind.toUpperCase()}
                    {point.snapshot ? (locale === "ja" ? "（同期時点）" : " (at sync)") : ""}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          {seriesList.flatMap((item) =>
            item.averageSegments.map((segment) => (
              <polyline
                className={`rating-average-line ${item.kind}`}
                points={segment.join(" ")}
                key={`${item.kind}-${segment[0]}`}
              />
            )),
          )}
        </svg>
        <div className="match-axis">
          <span>{labels.firstMatch}</span>
          <span>
            {labels.latestMatch} · {number.format(ordered.length)}
          </span>
        </div>
      </div>
    </article>
  );
}

type CharacterRecord = ReturnType<typeof aggregateMatches>["bySubjectCharacter"][number];
function CharacterPanel({
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
