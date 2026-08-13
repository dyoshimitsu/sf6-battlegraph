import { describe, expect, it } from "vitest";
import type { FirestoreArchive } from "./exportArchive";
import { buildRawPageWrites } from "./rawPageWrites";
import { ArchiveValidationError, validateFirestoreArchive } from "./validateArchive";

function archive(extra: FirestoreArchive["documents"] = []): FirestoreArchive {
  const documents = [
    { path: "players/100", data: { userCode: "100" } },
    { path: "players/100/manifests/matches", data: { totalMatches: 0 } },
    ...extra,
  ];
  return { format: "sf6-battlegraph.firestore-archive", version: 1, userCode: 100, exportedAt: "2026-08-13T00:00:00.000Z", documentCount: documents.length, documents };
}

describe("validateFirestoreArchive", () => {
  it("accepts an inline page even when object keys were reordered by Firestore", () => {
    const [page] = buildRawPageWrites({ path: "players/100/snapshots/S1/pages/P1", metadata: {}, raw: { z: 1, a: { y: 2, x: 3 } } });
    page.data.raw = { a: { x: 3, y: 2 }, z: 1 };
    expect(validateFirestoreArchive(archive([page])).documentCount).toBe(3);
  });

  it("accepts complete split raw parts", () => {
    const pages = buildRawPageWrites({ path: "players/100/snapshots/S1/pages/P1", metadata: {}, raw: { payload: "🔥".repeat(200_000) } });
    expect(validateFirestoreArchive(archive(pages)).documentCount).toBe(pages.length + 2);
  });

  it("rejects duplicate paths and corrupted raw data", () => {
    const duplicate = archive([{ path: "players/100", data: {} }]);
    expect(() => validateFirestoreArchive(duplicate)).toThrow(ArchiveValidationError);
    const [page] = buildRawPageWrites({ path: "players/100/snapshots/S1/pages/P1", metadata: {}, raw: { value: 1 } });
    page.data.raw = { value: 2 };
    expect(() => validateFirestoreArchive(archive([page]))).toThrow(/hash mismatch/);
  });

  it("rejects documents belonging to another player", () => {
    expect(() => validateFirestoreArchive(archive([{ path: "players/200/matches/M1", data: {} }]))).toThrow(/outside/);
  });
});
