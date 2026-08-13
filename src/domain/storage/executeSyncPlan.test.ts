import { describe, expect, it } from "vitest";
import { executeSyncPlan, MAX_WRITES_PER_BATCH, type SyncWritePort } from "./executeSyncPlan";
import type { PlannedWrite, SyncPlan } from "./syncPlan";

function plan(dataWriteCount: number): SyncPlan {
  const writesBeforeManifest = Array.from({ length: dataWriteCount }, (_, index): PlannedWrite => ({ path: `data/${index}`, data: { index } }));
  return { syncId: "sync", generation: "generation", userCode: 100, writesBeforeManifest, manifest: { path: "manifest/active", data: {} }, deletesAfterManifest: [], completionWrites: [{ path: "snapshots/sync", data: { status: "complete" } }, { path: "syncs/sync", data: { status: "complete" } }], writeCount: dataWriteCount + 3, storedMatches: [] };
}

describe("executeSyncPlan", () => {
  it("splits data writes into safe batches and completes the sync after manifest activation", async () => {
    const commits: string[][] = [];
    const port: SyncWritePort = { commit: async writes => { commits.push(writes.map(write => write.path)); }, remove: async () => undefined };
    await executeSyncPlan(port, plan(MAX_WRITES_PER_BATCH + 2));
    expect(commits.map(batch => batch.length)).toEqual([MAX_WRITES_PER_BATCH, 2, 1, 2]);
    expect(commits.slice(-2)).toEqual([["manifest/active"], ["snapshots/sync", "syncs/sync"]]);
  });

  it("never activates the manifest after a failed data batch", async () => {
    const committed: string[] = [];
    const port: SyncWritePort = { commit: async writes => { committed.push(...writes.map(write => write.path)); throw new Error("network failure"); }, remove: async () => undefined };
    await expect(executeSyncPlan(port, plan(2))).rejects.toThrow("network failure");
    expect(committed).not.toContain("manifest/active");
  });

  it("reports progress through final activation", async () => {
    const progress: string[] = [];
    await executeSyncPlan({ commit: async () => undefined, remove: async () => undefined }, plan(2), item => progress.push(`${item.phase}:${item.completed}/${item.total}`));
    expect(progress).toEqual(["data:2/5", "manifest:2/5", "finalize:3/5", "complete:5/5"]);
  });

  it("activates the new manifest before deleting obsolete chunks and then clears the pending list", async () => {
    const value = plan(1);
    value.deletesAfterManifest = ["chunks/old"];
    value.cleanupManifest = { path: "manifest/active", data: { obsoleteChunkIds: [] } };
    value.writeCount = 6;
    const operations: string[] = [];
    await executeSyncPlan({
      commit: async writes => { operations.push(`set:${writes.map(write => write.path).join(",")}`); },
      remove: async paths => { operations.push(`delete:${paths.join(",")}`); },
    }, value);
    expect(operations).toEqual([
      "set:data/0",
      "set:manifest/active",
      "delete:chunks/old",
      "set:manifest/active",
      "set:snapshots/sync,syncs/sync",
    ]);
  });

  it("does not mark the sync complete when manifest activation fails", async () => {
    const value = plan(0);
    const committed: string[] = [];
    await expect(executeSyncPlan({
      commit: async writes => {
        committed.push(...writes.map(write => write.path));
        if (writes.some(write => write.path === "manifest/active")) throw new Error("activation failed");
      },
      remove: async () => undefined,
    }, value)).rejects.toThrow("activation failed");
    expect(committed).not.toContain("snapshots/sync");
    expect(committed).not.toContain("syncs/sync");
  });

  it("leaves obsolete chunk ids in the active manifest when cleanup fails", async () => {
    const value = plan(0);
    value.manifest.data = { obsoleteChunkIds: ["old"] };
    value.deletesAfterManifest = ["chunks/old"];
    value.cleanupManifest = { path: "manifest/active", data: { obsoleteChunkIds: [] } };
    const commits: Record<string, unknown>[] = [];
    await expect(executeSyncPlan({
      commit: async writes => { commits.push(...writes.map(write => write.data)); },
      remove: async () => { throw new Error("cleanup failed"); },
    }, value)).rejects.toThrow("cleanup failed");
    expect(commits).toEqual([{ obsoleteChunkIds: ["old"] }]);
  });
});
