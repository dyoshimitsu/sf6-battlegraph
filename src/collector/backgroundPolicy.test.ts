import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface BackgroundPolicy {
  shouldActivateBucklerTab(status: string): boolean;
}

function loadPolicy(): BackgroundPolicy {
  const context: { Sf6BattlegraphBackgroundPolicy?: BackgroundPolicy } = {};
  runInNewContext(readFileSync(new URL("../../extension/background-policy.js", import.meta.url), "utf8"), context);
  if (!context.Sf6BattlegraphBackgroundPolicy) throw new Error("Background policy was not registered");
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
});
