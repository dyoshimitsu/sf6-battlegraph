import type { ArchiveDocument, FirestoreArchive } from "./exportArchive";
import { canonicalJson, sha256Hex } from "./jsonIntegrity";

export class ArchiveValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ArchiveValidationError"; }
}

function requireDocument(documents: Map<string, ArchiveDocument>, path: string): void {
  if (!documents.has(path)) throw new ArchiveValidationError(`Required archive document is missing: ${path}`);
}

export function validateFirestoreArchive(value: unknown): FirestoreArchive {
  if (!value || typeof value !== "object") throw new ArchiveValidationError("Archive must be an object");
  const archive = value as Partial<FirestoreArchive>;
  if (archive.format !== "sf6-battlegraph.firestore-archive" || archive.version !== 1) throw new ArchiveValidationError("Unsupported archive format or version");
  if (!Number.isSafeInteger(archive.userCode) || !Array.isArray(archive.documents)) throw new ArchiveValidationError("Archive metadata is invalid");
  const documents = new Map<string, ArchiveDocument>();
  for (const document of archive.documents) {
    if (!document || typeof document.path !== "string" || !document.data || typeof document.data !== "object") throw new ArchiveValidationError("Archive contains an invalid document");
    if (documents.has(document.path)) throw new ArchiveValidationError(`Archive contains a duplicate path: ${document.path}`);
    if (document.path !== "settings/deployment" && !document.path.startsWith(`players/${archive.userCode}/` ) && document.path !== `players/${archive.userCode}`) throw new ArchiveValidationError(`Archive path is outside the tracked player: ${document.path}`);
    documents.set(document.path, document);
  }
  if (archive.documentCount !== documents.size) throw new ArchiveValidationError("Archive document count does not match its contents");
  requireDocument(documents, `players/${archive.userCode}`);
  requireDocument(documents, `players/${archive.userCode}/manifests/matches`);

  for (const page of documents.values()) {
    if (!/\/snapshots\/[^/]+\/pages\/[^/]+$/.test(page.path)) continue;
    if (page.data.storage === undefined) continue; // Legacy inline page saved before integrity metadata.
    const expectedBytes = Number(page.data.rawUtf8Bytes);
    const expectedHash = page.data.rawSha256;
    if (!Number.isSafeInteger(expectedBytes) || typeof expectedHash !== "string") throw new ArchiveValidationError(`Raw integrity metadata is invalid: ${page.path}`);
    if (page.data.storage === "inline") {
      if (!("raw" in page.data) || sha256Hex(canonicalJson(page.data.raw)) !== expectedHash) throw new ArchiveValidationError(`Inline raw hash mismatch: ${page.path}`);
      if (new TextEncoder().encode(JSON.stringify(page.data.raw)).length !== expectedBytes) throw new ArchiveValidationError(`Inline raw byte count mismatch: ${page.path}`);
      continue;
    }
    if (page.data.storage !== "parts" || !Number.isSafeInteger(page.data.partCount)) throw new ArchiveValidationError(`Unknown raw storage format: ${page.path}`);
    const parts = [...documents.values()].filter(document => document.path.startsWith(`${page.path}/parts/`)).sort((left, right) => Number(left.data.index) - Number(right.data.index));
    if (parts.length !== page.data.partCount || parts.some((part, index) => part.data.index !== index || typeof part.data.data !== "string")) throw new ArchiveValidationError(`Raw parts are incomplete: ${page.path}`);
    const serialized = parts.map(part => part.data.data).join("");
    if (new TextEncoder().encode(serialized).length !== expectedBytes || sha256Hex(serialized) !== expectedHash) throw new ArchiveValidationError(`Raw parts integrity mismatch: ${page.path}`);
    try { JSON.parse(serialized); } catch { throw new ArchiveValidationError(`Raw parts do not reconstruct valid JSON: ${page.path}`); }
  }
  return archive as FirestoreArchive;
}
