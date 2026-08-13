import { doc, type Firestore, getDoc } from "firebase/firestore/lite";
import type { StoredManifest, StoredMatchReadPort } from "../domain/storage/loadStoredMatches";
import type { QueryChunk } from "../domain/storage/queryChunks";

export function createFirestoreReadPort(db: Firestore): StoredMatchReadPort {
  return {
    async getManifest(userCode) {
      const snapshot = await getDoc(doc(db, `players/${userCode}/manifests/matches`));
      return snapshot.exists() ? (snapshot.data() as StoredManifest) : null;
    },
    async getChunks(userCode, ids) {
      return Promise.all(
        ids.map(async (id) => {
          const snapshot = await getDoc(doc(db, `players/${userCode}/queryChunks/${id}`));
          if (!snapshot.exists()) throw new Error(`Query chunk is missing: ${id}`);
          return snapshot.data() as QueryChunk;
        }),
      );
    },
  };
}
