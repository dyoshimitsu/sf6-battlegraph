import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../domain/storage/jsonIntegrity";
import { loadProfileHabits } from "./loadProfileHabits";

const state = vi.hoisted(() => ({
  snapshots: [] as unknown[],
  page: null as unknown,
  parts: [] as unknown[],
}));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, path: string) => path,
  documentId: () => "id",
  orderBy: () => null,
  limit: () => null,
  query: (path: string) => path,
  getDocs: async (path: string) => ({
    docs: path.endsWith("/parts") ? state.parts : state.snapshots,
  }),
  getDoc: async () => state.page,
}));

describe("loadProfileHabits", () => {
  beforeEach(() => {
    state.snapshots = [];
    state.page = null;
    state.parts = [];
  });
  it("loads a complete split snapshot and checks its digest", async () => {
    const raw = {
      pageProps: {
        sid: 1,
        common: { statusCode: 200 },
        play: { battle_stats: { drive_parry: 2.9 } },
      },
    };
    const json = JSON.stringify(raw);
    state.snapshots = [{ id: "snapshot", data: () => ({ status: "complete" }) }];
    state.page = {
      exists: () => true,
      data: () => ({
        storage: "parts",
        partCount: 1,
        rawUtf8Bytes: new TextEncoder().encode(json).length,
        rawSha256: sha256Hex(json),
        fetchedAt: "2026-01-01T00:00:00Z",
      }),
    };
    state.parts = [{ data: () => ({ index: 0, data: json }) }];
    const result = await loadProfileHabits({} as never, 1);
    expect(result[0].values.drive_parry).toBe(2.9);
    state.parts = [];
    await expect(loadProfileHabits({} as never, 1)).rejects.toThrow("Incomplete profile snapshot");
  });
});
