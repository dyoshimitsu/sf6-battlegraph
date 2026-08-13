import { describe, expect, it } from "vitest";
import { shouldAutoSyncCollectorBundle } from "./autoSync";

describe("shouldAutoSyncCollectorBundle", () => {
  it("starts only for a validated collector result owned by an administrator", () => {
    expect(shouldAutoSyncCollectorBundle(true, true, "admin")).toBe(true);
  });

  it("waits while authentication is incomplete or lacks administrator access", () => {
    expect(shouldAutoSyncCollectorBundle(true, true, "loading")).toBe(false);
    expect(shouldAutoSyncCollectorBundle(true, true, "notAdmin")).toBe(false);
  });

  it("does not synchronize stored or unrequested data", () => {
    expect(shouldAutoSyncCollectorBundle(false, true, "admin")).toBe(false);
    expect(shouldAutoSyncCollectorBundle(true, false, "admin")).toBe(false);
  });
});
