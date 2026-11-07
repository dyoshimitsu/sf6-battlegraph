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
import { type ProfileHabits, parseProfileHabits } from "../domain/statistics/profileHabits";
import { canonicalJson, sha256Hex } from "../domain/storage/jsonIntegrity";

export async function loadProfileHabits(db: Firestore, userCode: number): Promise<ProfileHabits[]> {
  const base = `players/${userCode}/snapshots`;
  const snapshots = await getDocs(
    query(collection(db, base), orderBy(documentId(), "desc"), limit(10)),
  );
  const result: ProfileHabits[] = [];
  for (const snapshot of snapshots.docs) {
    if (snapshot.data().status !== "complete") continue;
    const path = `${base}/${snapshot.id}/pages/profile_play`;
    const page = await getDoc(doc(db, path));
    if (!page.exists()) continue;
    const data = page.data();
    let raw: unknown = data.raw;
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
      raw = JSON.parse(json);
    } else if (data.storage === "inline") {
      if (
        new TextEncoder().encode(JSON.stringify(raw)).length !== data.rawUtf8Bytes ||
        sha256Hex(canonicalJson(raw)) !== data.rawSha256
      )
        throw new Error("Profile snapshot integrity check failed");
    } else continue;
    const parsed = parseProfileHabits(raw, data.fetchedAt, userCode);
    if (parsed) result.push(parsed);
  }
  return result;
}
