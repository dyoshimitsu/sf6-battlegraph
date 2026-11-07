import {
  collection,
  doc,
  documentId,
  type Firestore,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore/lite";
import {
  type ProfileHabits,
  parseProfileHabits,
  type RankingLeaders,
} from "../domain/statistics/profileHabits";
import { canonicalJson, sha256Hex } from "../domain/storage/jsonIntegrity";
import { RANKING_PROFILE_PAGE_COUNT, rankingProfilePageId } from "../domain/storage/syncPlan";

export interface ProfileHabitsHistory {
  snapshots: ProfileHabits[];
  leaders: RankingLeaders | null;
}

interface RawPage {
  data: Record<string, unknown>;
  raw: unknown;
}

/** Reads a raw snapshot page and verifies its size and digest. Returns null when absent. */
async function readRawPage(db: Firestore, path: string): Promise<RawPage | null> {
  const page = await getDoc(doc(db, path));
  if (!page.exists()) return null;
  const data = page.data();
  if (data.storage === "parts") {
    const parts = await getDocs(collection(db, `${path}/parts`));
    const entries = parts.docs.map((part) => part.data()).sort((a, b) => a.index - b.index);
    if (
      entries.length !== data.partCount ||
      entries.some((part, index) => part.index !== index || typeof part.data !== "string")
    )
      throw new Error("Incomplete profile snapshot");
    const json = entries.map((part) => part.data).join("");
    const bytes = new TextEncoder().encode(json);
    if (bytes.length !== data.rawUtf8Bytes || sha256Hex(bytes) !== data.rawSha256)
      throw new Error("Profile snapshot integrity check failed");
    return { data, raw: JSON.parse(json) };
  }
  if (data.storage === "inline") {
    if (
      new TextEncoder().encode(JSON.stringify(data.raw)).length !== data.rawUtf8Bytes ||
      sha256Hex(canonicalJson(data.raw)) !== data.rawSha256
    )
      throw new Error("Profile snapshot integrity check failed");
    return { data, raw: data.raw };
  }
  return null;
}

async function readLeaders(db: Firestore, pagesPath: string): Promise<RankingLeaders | null> {
  const profiles: ProfileHabits[] = [];
  let characterSlug: string | undefined;
  let fetchedAt: string | undefined;
  for (let position = 1; position <= RANKING_PROFILE_PAGE_COUNT; position += 1) {
    const page = await readRawPage(db, `${pagesPath}/${rankingProfilePageId(position)}`);
    if (!page) break;
    const userCode = page.data.rankingUserCode;
    if (typeof userCode !== "number") continue;
    const parsed = parseProfileHabits(page.raw, page.data.fetchedAt, userCode);
    if (!parsed) continue;
    profiles.push(parsed);
    if (typeof page.data.characterSlug === "string") characterSlug = page.data.characterSlug;
    fetchedAt ??= parsed.fetchedAt;
  }
  return profiles.length && characterSlug && fetchedAt
    ? { characterSlug, fetchedAt, profiles }
    : null;
}

export async function loadProfileHabits(
  db: Firestore,
  userCode: number,
): Promise<ProfileHabitsHistory> {
  const base = `players/${userCode}/snapshots`;
  const snapshots = await getDocs(
    query(collection(db, base), orderBy(documentId(), "desc"), limit(10)),
  );
  const result: ProfileHabits[] = [];
  let leaders: RankingLeaders | null = null;
  let checkedLeaders = false;
  for (const snapshot of snapshots.docs) {
    if (snapshot.data().status !== "complete") continue;
    const pagesPath = `${base}/${snapshot.id}/pages`;
    // Leaders are compared only with the latest complete sync, so older syncs cost no reads.
    if (!checkedLeaders) {
      checkedLeaders = true;
      leaders = await readLeaders(db, pagesPath);
    }
    const page = await readRawPage(db, `${pagesPath}/profile_play`);
    if (!page) continue;
    const parsed = parseProfileHabits(page.raw, page.data.fetchedAt, userCode);
    if (parsed) result.push(parsed);
  }
  return { snapshots: result, leaders };
}
