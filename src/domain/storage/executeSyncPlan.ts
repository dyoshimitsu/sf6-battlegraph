import type { PlannedWrite, SyncPlan } from "./syncPlan";

export const MAX_WRITES_PER_BATCH = 450;

export interface SyncWritePort {
  commit(writes: PlannedWrite[]): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface SyncProgress {
  completed: number;
  total: number;
  phase: "data" | "manifest" | "cleanup" | "finalize" | "complete";
}

export async function executeSyncPlan(
  port: SyncWritePort,
  plan: SyncPlan,
  onProgress?: (progress: SyncProgress) => void,
): Promise<void> {
  let completed = 0;
  for (let offset = 0; offset < plan.writesBeforeManifest.length; offset += MAX_WRITES_PER_BATCH) {
    const writes = plan.writesBeforeManifest.slice(offset, offset + MAX_WRITES_PER_BATCH);
    await port.commit(writes);
    completed += writes.length;
    onProgress?.({ completed, total: plan.writeCount, phase: "data" });
  }
  onProgress?.({ completed, total: plan.writeCount, phase: "manifest" });
  await port.commit([plan.manifest]);
  completed += 1;
  for (let offset = 0; offset < plan.deletesAfterManifest.length; offset += MAX_WRITES_PER_BATCH) {
    const paths = plan.deletesAfterManifest.slice(offset, offset + MAX_WRITES_PER_BATCH);
    onProgress?.({ completed, total: plan.writeCount, phase: "cleanup" });
    await port.remove(paths);
    completed += paths.length;
  }
  if (plan.cleanupManifest) {
    await port.commit([plan.cleanupManifest]);
    completed += 1;
  }
  onProgress?.({ completed, total: plan.writeCount, phase: "finalize" });
  await port.commit(plan.completionWrites);
  completed += plan.completionWrites.length;
  onProgress?.({ completed: plan.writeCount, total: plan.writeCount, phase: "complete" });
}
