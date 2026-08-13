import type { FirestoreArchive } from "./exportArchive";
import { validateFirestoreArchive } from "./validateArchive";

export const MAX_RESTORE_WRITES_PER_BATCH = 450;

export interface RestoreWrite {
  path: string;
  data: Record<string, unknown>;
}

export interface RestorePlan {
  userCode: number;
  writesBeforeManifest: RestoreWrite[];
  manifest: RestoreWrite;
  writeCount: number;
}

export interface RestoreWritePort {
  commit(writes: RestoreWrite[]): Promise<void>;
}

export function buildRestorePlan(value: unknown, expectedUserCode: number): RestorePlan {
  const archive: FirestoreArchive = validateFirestoreArchive(value);
  if (archive.userCode !== expectedUserCode) throw new Error(`Archive user code ${archive.userCode} does not match ${expectedUserCode}`);
  const manifestPath = `players/${expectedUserCode}/manifests/matches`;
  const manifest = archive.documents.find(document => document.path === manifestPath);
  if (!manifest) throw new Error("Archive manifest is missing");
  const writesBeforeManifest = archive.documents.filter(document => document.path !== manifestPath);
  return { userCode: expectedUserCode, writesBeforeManifest, manifest, writeCount: archive.documents.length };
}

export async function executeRestorePlan(port: RestoreWritePort, plan: RestorePlan, onProgress?: (completed: number, total: number) => void): Promise<void> {
  let completed = 0;
  for (let offset = 0; offset < plan.writesBeforeManifest.length; offset += MAX_RESTORE_WRITES_PER_BATCH) {
    const writes = plan.writesBeforeManifest.slice(offset, offset + MAX_RESTORE_WRITES_PER_BATCH);
    await port.commit(writes);
    completed += writes.length;
    onProgress?.(completed, plan.writeCount);
  }
  await port.commit([plan.manifest]);
  onProgress?.(plan.writeCount, plan.writeCount);
}
