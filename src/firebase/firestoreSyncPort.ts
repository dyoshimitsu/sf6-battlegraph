import { arrayUnion, doc, serverTimestamp, writeBatch, type Firestore } from "firebase/firestore/lite";
import type { PlannedWrite } from "../domain/storage/syncPlan";
import type { SyncWritePort } from "../domain/storage/executeSyncPlan";

function withServerMetadata(write: PlannedWrite): Record<string, unknown> {
  const data = { ...write.data };
  if (/\/matches\/[^/]+$/.test(write.path)) {
    data.sourceSyncIds = arrayUnion(...((write.data.sourceSyncIds as string[] | undefined) ?? []));
    data.lastSeenAt = serverTimestamp();
  }
  if (/\/snapshots\/[^/]+$/.test(write.path)) data.savedAt = serverTimestamp();
  if (/\/syncs\/[^/]+$/.test(write.path)) data.updatedAt = serverTimestamp();
  if (/\/manifests\/matches$/.test(write.path)) data.updatedAt = serverTimestamp();
  if (/^players\/[^/]+$/.test(write.path)) data.lastSyncedAt = serverTimestamp();
  return data;
}

export function createFirestoreSyncPort(db: Firestore): SyncWritePort {
  return {
    async commit(writes) {
      const batch = writeBatch(db);
      for (const write of writes) batch.set(doc(db, write.path), withServerMetadata(write), { merge: true });
      await batch.commit();
    },
  };
}
