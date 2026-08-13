import { describe, expect, it } from "vitest";
import { BUCKLER_ORIGIN, buildBucklerLaunchUrl, createCollectorAuthenticationRequiredMessage, createCollectorResultMessage, readBattlegraphTargetOrigin, readCollectorResultMessage, readCollectorStatusMessage } from "./bridge";
import type { BucklerCollectorBundle } from "../domain/buckler/types";

const bundle = {
  format: "sf6-battlegraph.collector",
  version: 1,
  userCode: 1134991793,
  buildId: "build-id",
  exportedAt: "2026-08-13T00:00:00.000Z",
  pages: [],
} satisfies BucklerCollectorBundle;

describe("collector bridge", () => {
  it("accepts a versioned result only from Buckler", () => {
    const message = createCollectorResultMessage(bundle);
    expect(readCollectorResultMessage(BUCKLER_ORIGIN, message)).toEqual(message);
    expect(readCollectorResultMessage("http://192.168.201.128:5174", message, "http://192.168.201.128:5174")).toEqual(message);
    expect(readCollectorResultMessage("https://example.com", message)).toBeNull();
  });

  it("ignores unrelated and unsupported messages", () => {
    expect(readCollectorResultMessage(BUCKLER_ORIGIN, { type: "other" })).toBeNull();
    expect(readCollectorResultMessage(BUCKLER_ORIGIN, { ...createCollectorResultMessage(bundle), version: 2 })).toBeNull();
  });

  it("round-trips a restricted Battlegraph target origin through the Buckler URL", () => {
    const url = new URL(buildBucklerLaunchUrl(bundle.userCode, "https://owner.github.io"));
    expect(url.origin).toBe(BUCKLER_ORIGIN);
    expect(readBattlegraphTargetOrigin(url.hash)).toBe("https://owner.github.io");
    expect(readBattlegraphTargetOrigin("#sf6-battlegraph-origin=http%3A%2F%2F192.168.201.128%3A5174")).toBe("http://192.168.201.128:5174");
    expect(readBattlegraphTargetOrigin("#sf6-battlegraph-origin=http://example.com")).toBeNull();
  });

  it("accepts authentication status only from the receiver origin", () => {
    const status = createCollectorAuthenticationRequiredMessage();
    expect(readCollectorStatusMessage("https://owner.github.io", status, "https://owner.github.io")).toEqual(status);
    expect(readCollectorStatusMessage(BUCKLER_ORIGIN, status, "https://owner.github.io")).toBeNull();
  });
});
