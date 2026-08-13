export interface ArchiveDocument {
  path: string;
  data: Record<string, unknown>;
}

export interface ArchiveReadPort {
  getDocument(path: string): Promise<ArchiveDocument | null>;
  listDocuments(path: string): Promise<ArchiveDocument[]>;
}

export interface FirestoreArchive {
  format: "sf6-battlegraph.firestore-archive";
  version: 1;
  userCode: number;
  exportedAt: string;
  documentCount: number;
  documents: ArchiveDocument[];
}

export async function exportFirestoreArchive(port: ArchiveReadPort, userCode: number, exportedAt = new Date().toISOString()): Promise<FirestoreArchive> {
  const base = `players/${userCode}`;
  const roots = await Promise.all([
    port.getDocument("settings/deployment"),
    port.getDocument(base),
    port.getDocument(`${base}/manifests/matches`),
  ]);
  const [matches, queryChunks, snapshots, syncs] = await Promise.all([
    port.listDocuments(`${base}/matches`),
    port.listDocuments(`${base}/queryChunks`),
    port.listDocuments(`${base}/snapshots`),
    port.listDocuments(`${base}/syncs`),
  ]);
  const pages = (await Promise.all(snapshots.map(snapshot => port.listDocuments(`${snapshot.path}/pages`)))).flat();
  const parts = (await Promise.all(pages.filter(page => page.data.storage === "parts").map(page => port.listDocuments(`${page.path}/parts`)))).flat();
  const documents = [...roots.filter((document): document is ArchiveDocument => document !== null), ...matches, ...queryChunks, ...snapshots, ...pages, ...parts, ...syncs]
    .sort((left, right) => left.path.localeCompare(right.path));
  return { format: "sf6-battlegraph.firestore-archive", version: 1, userCode, exportedAt, documentCount: documents.length, documents };
}
