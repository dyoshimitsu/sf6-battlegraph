import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Stored raw-page hashes were computed with the browser's default collation, which
// matches English collation for Japanese and English locales. Pin it so a reader in
// another locale (or Node.js) reproduces the same key order. Do not switch to
// code-point order: that would invalidate existing hashes.
const KEY_COLLATOR = new Intl.Collator("en");

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => KEY_COLLATOR.compare(left, right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Hex(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(sha256(bytes));
}
