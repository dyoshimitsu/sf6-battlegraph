import {
  arrayUnion,
  doc,
  type Firestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore/lite";
import type { SyncWritePort } from "../domain/storage/executeSyncPlan";
import type { PlannedWrite } from "../domain/storage/syncPlan";

function withServerMetadata(write: PlannedWrite): Record<string, unknown> {
  const data = { ...write.data };
  if (/\/matches\/[^/]+$/.test(write.path)) {
    data.sourceSyncIds = arrayUnion(...((write.data.sourceSyncIds as string[] | undefined) ?? []));
    data.lastSeenAt = serverTimestamp();
  }
  if (/\/snapshots\/[^/]+$/.test(write.path)) {
    if (write.data.status === "prepared") data.startedAt = serverTimestamp();
    if (write.data.status === "complete") data.completedAt = serverTimestamp();
  }
  if (/\/syncs\/[^/]+$/.test(write.path)) data.updatedAt = serverTimestamp();
  if (/\/manifests\/matches$/.test(write.path)) data.updatedAt = serverTimestamp();
  if (/^players\/[^/]+$/.test(write.path)) data.lastSyncedAt = serverTimestamp();
  return data;
}

export function createFirestoreSyncPort(db: Firestore): SyncWritePort {
  return {
    async commit(writes) {
      const batch = writeBatch(db);
      for (const write of writes)
        batch.set(doc(db, write.path), withServerMetadata(write), { merge: true });
      await batch.commit();
    },
    async remove(paths) {
      const batch = writeBatch(db);
      for (const path of paths) batch.delete(doc(db, path));
      await batch.commit();
    },
  };
}
