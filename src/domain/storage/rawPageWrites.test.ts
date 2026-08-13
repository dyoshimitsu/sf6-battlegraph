import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "./jsonIntegrity";
import { buildRawPageWrites, MAX_RAW_PART_BYTES } from "./rawPageWrites";

describe("buildRawPageWrites", () => {
  it("keeps small raw responses inline with a recovery hash", () => {
    const raw = { pageProps: { replay_list: [{ replay_id: "ONE" }] } };
    const [write] = buildRawPageWrites({
      path: "snapshots/sync/pages/all",
      metadata: { page: 1 },
      raw,
    });
    expect(write.data).toMatchObject({ storage: "inline", raw, page: 1 });
    expect(write.data.rawSha256).toBe(sha256Hex(canonicalJson(raw)));
  });

  it("splits oversized Unicode JSON into bounded parts that reconstruct exactly", () => {
    const raw = { payload: "対戦🔥".repeat(100_000) };
    const writes = buildRawPageWrites({ path: "snapshots/sync/pages/all", metadata: {}, raw });
    expect(writes[0].data).toMatchObject({ storage: "parts", partCount: writes.length - 1 });
    const serialized = writes
      .slice(1)
      .map((write) => write.data.data)
      .join("");
    expect(JSON.parse(serialized)).toEqual(raw);
    expect(
      writes.slice(1).every((write) => Number(write.data.utf8Bytes) <= MAX_RAW_PART_BYTES),
    ).toBe(true);
    expect(writes[0].data.rawSha256).toBe(sha256Hex(serialized));
  });
});
