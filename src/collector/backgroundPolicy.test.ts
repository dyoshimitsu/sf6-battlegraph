import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildBucklerLaunchUrl } from "./bridge";

interface BackgroundPolicy {
  shouldActivateBucklerTab(status: string): boolean;
  isBucklerBattleLogUrl(value: unknown): boolean;
}

function loadPolicy(): BackgroundPolicy {
  const context: { URL: typeof URL; Sf6BattlegraphBackgroundPolicy?: BackgroundPolicy } = { URL };
  runInNewContext(
    readFileSync(new URL("../../extension/background-policy.js", import.meta.url), "utf8"),
    context,
  );
  if (!context.Sf6BattlegraphBackgroundPolicy)
    throw new Error("Background policy was not registered");
  return context.Sf6BattlegraphBackgroundPolicy;
}

describe("Chrome connector background tab policy", () => {
  const policy = loadPolicy();

  it("keeps Buckler in the background while collection starts", () => {
    expect(policy.shouldActivateBucklerTab("started")).toBe(false);
  });

  it("activates Buckler only when login is required", () => {
    expect(policy.shouldActivateBucklerTab("authentication-required")).toBe(true);
    expect(policy.shouldActivateBucklerTab("error")).toBe(false);
  });

  it("opens only Buckler Battle Log URLs", () => {
    expect(
      policy.isBucklerBattleLogUrl(
        buildBucklerLaunchUrl(1000000001, "https://owner.github.io", ["KNOWN001"]),
      ),
    ).toBe(true);
    for (const value of [
      "https://example.com/6/buckler/ja-jp/profile/1000000001/battlelog",
      "http://www.streetfighter.com/6/buckler/ja-jp/profile/1000000001/battlelog",
      "https://www.streetfighter.com/6/buckler/ja-jp/profile/1000000001/play",
      "javascript:alert(1)",
      "not a url",
      undefined,
    ])
      expect(policy.isBucklerBattleLogUrl(value)).toBe(false);
  });
});
