import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncId } from "./createSyncId";

describe("createSyncId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses randomUUID when the browser provides it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid" });
    expect(createSyncId(123)).toBe("123-uuid");
  });

  it("works in an insecure HTTP context without randomUUID", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(createSyncId(123)).toMatch(/^123-[0-9a-f]{32}$/);
    vi.restoreAllMocks();
  });
});
