import {
  collection,
  documentId,
  type Firestore,
  getDocs,
  query,
  where,
} from "firebase/firestore/lite";
import type { MatchSideReadPort } from "../domain/storage/hydrateMatchSides";

const DOCUMENT_ID_QUERY_LIMIT = 30;

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

export function createFirestoreMatchSidePort(db: Firestore): MatchSideReadPort {
  return {
    async getMatchSides(userCode, replayIds) {
      const sides = new Map<string, 1 | 2>();
      const matches = collection(db, `players/${userCode}/matches`);
      for (const ids of chunks([...new Set(replayIds)], DOCUMENT_ID_QUERY_LIMIT)) {
        if (!ids.length) continue;
        const snapshot = await getDocs(query(matches, where(documentId(), "in", ids)));
        for (const document of snapshot.docs) {
          const side = document.data().subjectSide;
          if (side === 1 || side === 2) sides.set(document.id, side);
        }
      }
      return sides;
    },
  };
}
