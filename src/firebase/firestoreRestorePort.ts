import { doc, type Firestore, Timestamp, writeBatch } from "firebase/firestore/lite";
import type { RestoreWritePort } from "../domain/storage/restoreArchive";

export function reviveFirestoreData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveFirestoreData);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      record.type === "firestore/timestamp/1.0" &&
      Number.isSafeInteger(record.seconds) &&
      Number.isSafeInteger(record.nanoseconds)
    ) {
      return new Timestamp(Number(record.seconds), Number(record.nanoseconds));
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, reviveFirestoreData(item)]),
    );
  }
  return value;
}

export function createFirestoreRestorePort(db: Firestore): RestoreWritePort {
  return {
    async commit(writes) {
      const batch = writeBatch(db);
      for (const write of writes)
        batch.set(doc(db, write.path), reviveFirestoreData(write.data) as Record<string, unknown>, {
          merge: true,
        });
      await batch.commit();
    },
  };
}
