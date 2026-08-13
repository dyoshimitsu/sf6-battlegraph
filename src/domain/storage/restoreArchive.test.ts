import { describe, expect, it } from "vitest";
import type { FirestoreArchive } from "./exportArchive";
import { buildRestorePlan, executeRestorePlan, MAX_RESTORE_WRITES_PER_BATCH } from "./restoreArchive";

function archive(userCode = 100): FirestoreArchive {
  const documents = [
    { path: `players/${userCode}`, data: { userCode: String(userCode) } },
    { path: `players/${userCode}/matches/M1`, data: { replayId: "M1" } },
    { path: `players/${userCode}/manifests/matches`, data: { totalMatches: 1 } },
  ];
  return { format: "sf6-battlegraph.firestore-archive", version: 1, userCode, exportedAt: "2026-08-13T00:00:00.000Z", documentCount: documents.length, documents };
}

describe("Firestore archive restore", () => {
  it("validates the player and always places the manifest last", () => {
    const plan = buildRestorePlan(archive(), 100);
    expect(plan.writesBeforeManifest.map(write => write.path)).not.toContain("players/100/manifests/matches");
    expect(plan.manifest.path).toBe("players/100/manifests/matches");
    expect(() => buildRestorePlan(archive(200), 100)).toThrow(/does not match/);
  });

  it("batches data and activates the manifest only after every data batch", async () => {
    const value = archive();
    value.documents.splice(1, 0, ...Array.from({ length: MAX_RESTORE_WRITES_PER_BATCH }, (_, index) => ({ path: `players/100/matches/X${index}`, data: { index } })));
    value.documentCount = value.documents.length;
    const commits: string[][] = [];
    await executeRestorePlan({ commit: async writes => { commits.push(writes.map(write => write.path)); } }, buildRestorePlan(value, 100));
    expect(commits.map(commit => commit.length)).toEqual([MAX_RESTORE_WRITES_PER_BATCH, 2, 1]);
    expect(commits.at(-1)).toEqual(["players/100/manifests/matches"]);
  });

  it("does not activate the manifest after a failed data write", async () => {
    const committed: string[] = [];
    await expect(executeRestorePlan({ commit: async writes => { committed.push(...writes.map(write => write.path)); throw new Error("failed"); } }, buildRestorePlan(archive(), 100))).rejects.toThrow("failed");
    expect(committed).not.toContain("players/100/manifests/matches");
  });
});
