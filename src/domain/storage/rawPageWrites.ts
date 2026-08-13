import type { PlannedWrite } from "./syncPlan";
import { canonicalJson, sha256Hex } from "./jsonIntegrity";

export const MAX_INLINE_RAW_BYTES = 700 * 1024;
export const MAX_RAW_PART_BYTES = 700 * 1024;

export interface RawPageWriteInput {
  path: string;
  metadata: Record<string, unknown>;
  raw: unknown;
}

function splitUtf8(bytes: Uint8Array, maxBytes: number): string[] {
  const decoder = new TextDecoder();
  const parts: string[] = [];
  const sliceBytes = Math.max(1, maxBytes - 4);
  for (let offset = 0; offset < bytes.length; offset += sliceBytes) {
    const end = Math.min(offset + sliceBytes, bytes.length);
    const part = decoder.decode(bytes.subarray(offset, end), { stream: end < bytes.length });
    if (part) parts.push(part);
  }
  return parts;
}

export function buildRawPageWrites(input: RawPageWriteInput): PlannedWrite[] {
  const serialized = JSON.stringify(input.raw);
  const bytes = new TextEncoder().encode(serialized);
  const rawSha256 = bytes.length <= MAX_INLINE_RAW_BYTES ? sha256Hex(canonicalJson(input.raw)) : sha256Hex(bytes);
  const common = { ...input.metadata, rawUtf8Bytes: bytes.length, rawSha256 };
  if (bytes.length <= MAX_INLINE_RAW_BYTES) {
    return [{ path: input.path, data: { ...common, storage: "inline", raw: input.raw } }];
  }
  const parts = splitUtf8(bytes, MAX_RAW_PART_BYTES);
  return [
    { path: input.path, data: { ...common, storage: "parts", partCount: parts.length } },
    ...parts.map((data, index) => ({
      path: `${input.path}/parts/${String(index + 1).padStart(4, "0")}`,
      data: { index, data, utf8Bytes: new TextEncoder().encode(data).length },
    })),
  ];
}
