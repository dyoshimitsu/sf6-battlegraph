import type { PlannedWrite, SyncPlan } from "./syncPlan";

export const MAX_WRITES_PER_BATCH = 450;

export interface SyncWritePort {
  commit(writes: PlannedWrite[]): Promise<void>;
}

export interface SyncProgress {
  completed: number;
  total: number;
  phase: "data" | "manifest" | "complete";
}

export async function executeSyncPlan(port: SyncWritePort, plan: SyncPlan, onProgress?: (progress: SyncProgress) => void): Promise<void> {
  let completed = 0;
  for (let offset = 0; offset < plan.writesBeforeManifest.length; offset += MAX_WRITES_PER_BATCH) {
    const writes = plan.writesBeforeManifest.slice(offset, offset + MAX_WRITES_PER_BATCH);
    await port.commit(writes);
    completed += writes.length;
    onProgress?.({ completed, total: plan.writeCount, phase: "data" });
  }
  onProgress?.({ completed, total: plan.writeCount, phase: "manifest" });
  await port.commit([plan.manifest]);
  onProgress?.({ completed: plan.writeCount, total: plan.writeCount, phase: "complete" });
}
