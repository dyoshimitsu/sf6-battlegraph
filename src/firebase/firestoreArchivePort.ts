import { collection, doc, type Firestore, getDoc, getDocs } from "firebase/firestore/lite";
import type { ArchiveReadPort } from "../domain/storage/exportArchive";

export function createFirestoreArchivePort(db: Firestore): ArchiveReadPort {
  return {
    async getDocument(path) {
      const snapshot = await getDoc(doc(db, path));
      return snapshot.exists() ? { path, data: snapshot.data() } : null;
    },
    async listDocuments(path) {
      const snapshot = await getDocs(collection(db, path));
      return snapshot.docs.map((document) => ({
        path: `${path}/${document.id}`,
        data: document.data(),
      }));
    },
  };
}
