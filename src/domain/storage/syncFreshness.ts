export type SyncFreshnessLevel = "fresh" | "warning" | "urgent";

const DAY_SECONDS = 86_400;

export function readLastSyncedAtEpoch(manifest?: { syncedAtEpoch?: number; sourceSyncId?: string } | null): number | undefined {
  if (manifest?.syncedAtEpoch !== undefined && Number.isFinite(manifest.syncedAtEpoch)) return manifest.syncedAtEpoch;
  const milliseconds = Number(manifest?.sourceSyncId?.split("-", 1)[0]);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.floor(milliseconds / 1000) : undefined;
}

export function getSyncFreshness(lastSyncedAtEpoch: number | undefined, nowEpoch = Math.floor(Date.now() / 1000)): { days: number; level: SyncFreshnessLevel } | null {
  if (lastSyncedAtEpoch === undefined || !Number.isFinite(lastSyncedAtEpoch)) return null;
  const days = Math.max(0, Math.floor((nowEpoch - lastSyncedAtEpoch) / DAY_SECONDS));
  return { days, level: days >= 14 ? "urgent" : days >= 7 ? "warning" : "fresh" };
}
