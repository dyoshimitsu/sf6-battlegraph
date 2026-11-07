import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../domain/storage/jsonIntegrity";
import { buildRawPageWrites } from "../domain/storage/rawPageWrites";
import { loadProfileHabits } from "./loadProfileHabits";

const state = vi.hoisted(() => ({
  snapshots: [] as unknown[],
  documents: new Map<string, Record<string, unknown>>(),
}));
vi.mock("firebase/firestore/lite", () => ({
  collection: (_db: unknown, path: string) => path,
  doc: (_db: unknown, path: string) => path,
  documentId: () => "id",
  orderBy: () => null,
  limit: () => null,
  query: (path: string) => path,
  getDocs: async (path: string) => ({
    docs: path.endsWith("/parts")
      ? [...state.documents]
          .filter(([key]) => key.startsWith(`${path}/`))
          .map(([, data]) => ({ data: () => data }))
      : state.snapshots,
  }),
  getDoc: async (path: string) => ({
    exists: () => state.documents.has(path),
    data: () => state.documents.get(path),
  }),
}));

const PAGES = "players/1/snapshots/snapshot/pages";

function profile(sid: number, driveParry: number) {
  return {
    pageProps: {
      sid,
      common: { statusCode: 200 },
      play: { battle_stats: { drive_parry: driveParry } },
    },
  };
}

function store(path: string, raw: unknown, metadata: Record<string, unknown> = {}) {
  for (const write of buildRawPageWrites({
    path,
    metadata: { fetchedAt: "2026-01-01T00:00:00Z", ...metadata },
    raw,
    forceParts: true,
  }))
    state.documents.set(write.path, write.data);
}

describe("loadProfileHabits", () => {
  beforeEach(() => {
    state.snapshots = [{ id: "snapshot", data: () => ({ status: "complete" }) }];
    state.documents = new Map();
  });

  it("loads a complete split snapshot and checks its digest", async () => {
    const raw = profile(1, 2.9);
    const json = JSON.stringify(raw);
    state.documents.set(`${PAGES}/profile_play`, {
      storage: "parts",
      partCount: 1,
      rawUtf8Bytes: new TextEncoder().encode(json).length,
      rawSha256: sha256Hex(json),
      fetchedAt: "2026-01-01T00:00:00Z",
    });
    state.documents.set(`${PAGES}/profile_play/parts/0001`, { index: 0, data: json });
    const result = await loadProfileHabits({} as never, 1);
    expect(result.snapshots[0].values.drive_parry).toBe(2.9);
    expect(result.leaders).toBeNull();
    state.documents.delete(`${PAGES}/profile_play/parts/0001`);
    await expect(loadProfileHabits({} as never, 1)).rejects.toThrow("Incomplete profile snapshot");
  });

  it("loads ranking leader profiles from the latest complete sync", async () => {
    store(`${PAGES}/profile_play`, profile(1, 2));
    store(`${PAGES}/ranking_profile_001`, profile(7, 4), {
      rankingUserCode: 7,
      characterSlug: "jamie",
    });
    store(`${PAGES}/ranking_profile_002`, profile(8, 6), {
      rankingUserCode: 8,
      characterSlug: "jamie",
    });
    const { leaders } = await loadProfileHabits({} as never, 1);
    expect(leaders?.characterSlug).toBe("jamie");
    expect(leaders?.profiles.map((item) => item.values.drive_parry)).toEqual([4, 6]);
  });

  it("reads the leaders from the sync the manifest points to", async () => {
    store(`${PAGES}/profile_play`, profile(1, 2));
    store("players/1/snapshots/older/pages/ranking_profile_001", profile(9, 8), {
      rankingUserCode: 9,
      characterSlug: "ken",
    });
    const { snapshots, leaders } = await loadProfileHabits({} as never, 1, "older");
    expect(snapshots).toHaveLength(1);
    expect(leaders?.characterSlug).toBe("ken");
    expect(leaders?.profiles[0].values.drive_parry).toBe(8);
  });
});
