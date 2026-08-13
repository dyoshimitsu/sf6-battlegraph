import { describe, expect, it } from "vitest";
import { executeSyncPlan, MAX_WRITES_PER_BATCH, type SyncWritePort } from "./executeSyncPlan";
import type { PlannedWrite, SyncPlan } from "./syncPlan";

function plan(dataWriteCount: number): SyncPlan {
  const writesBeforeManifest = Array.from({ length: dataWriteCount }, (_, index): PlannedWrite => ({ path: `data/${index}`, data: { index } }));
  return { syncId: "sync", generation: "generation", userCode: 100, writesBeforeManifest, manifest: { path: "manifest/active", data: {} }, writeCount: dataWriteCount + 1, storedMatches: [] };
}

describe("executeSyncPlan", () => {
  it("splits data writes into safe batches and commits the manifest last", async () => {
    const commits: string[][] = [];
    const port: SyncWritePort = { commit: async writes => { commits.push(writes.map(write => write.path)); } };
    await executeSyncPlan(port, plan(MAX_WRITES_PER_BATCH + 2));
    expect(commits.map(batch => batch.length)).toEqual([MAX_WRITES_PER_BATCH, 2, 1]);
    expect(commits.at(-1)).toEqual(["manifest/active"]);
  });

  it("never activates the manifest after a failed data batch", async () => {
    const committed: string[] = [];
    const port: SyncWritePort = { commit: async writes => { committed.push(...writes.map(write => write.path)); throw new Error("network failure"); } };
    await expect(executeSyncPlan(port, plan(2))).rejects.toThrow("network failure");
    expect(committed).not.toContain("manifest/active");
  });

  it("reports progress through final activation", async () => {
    const progress: string[] = [];
    await executeSyncPlan({ commit: async () => undefined }, plan(2), item => progress.push(`${item.phase}:${item.completed}/${item.total}`));
    expect(progress).toEqual(["data:2/3", "manifest:2/3", "complete:3/3"]);
  });
});
