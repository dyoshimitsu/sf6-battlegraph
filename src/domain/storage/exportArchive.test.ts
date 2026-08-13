import { describe, expect, it } from "vitest";
import { exportFirestoreArchive, type ArchiveDocument, type ArchiveReadPort } from "./exportArchive";

describe("exportFirestoreArchive", () => {
  it("exports every known data layer and reads parts only for split pages", async () => {
    const listed: string[] = [];
    const collections: Record<string, ArchiveDocument[]> = {
      "players/100/matches": [{ path: "players/100/matches/M1", data: { replayId: "M1" } }],
      "players/100/queryChunks": [{ path: "players/100/queryChunks/C1", data: { count: 1 } }],
      "players/100/snapshots": [{ path: "players/100/snapshots/S1", data: { syncId: "S1" } }],
      "players/100/snapshots/S1/pages": [
        { path: "players/100/snapshots/S1/pages/P1", data: { storage: "parts" } },
        { path: "players/100/snapshots/S1/pages/P2", data: { storage: "inline" } },
      ],
      "players/100/snapshots/S1/pages/P1/parts": [{ path: "players/100/snapshots/S1/pages/P1/parts/0001", data: { data: "{}" } }],
      "players/100/syncs": [{ path: "players/100/syncs/S1", data: { status: "prepared" } }],
    };
    const roots: Record<string, ArchiveDocument> = {
      "settings/deployment": { path: "settings/deployment", data: { visibility: "private" } },
      "players/100": { path: "players/100", data: { userCode: "100" } },
      "players/100/manifests/matches": { path: "players/100/manifests/matches", data: { totalMatches: 1 } },
    };
    const port: ArchiveReadPort = {
      getDocument: async path => roots[path] ?? null,
      listDocuments: async path => { listed.push(path); return collections[path] ?? []; },
    };
    const archive = await exportFirestoreArchive(port, 100, "2026-08-13T00:00:00.000Z");
    expect(archive).toMatchObject({ format: "sf6-battlegraph.firestore-archive", version: 1, userCode: 100, documentCount: 10 });
    expect(archive.documents.map(document => document.path)).toContain("players/100/snapshots/S1/pages/P1/parts/0001");
    expect(listed).not.toContain("players/100/snapshots/S1/pages/P2/parts");
  });
});
