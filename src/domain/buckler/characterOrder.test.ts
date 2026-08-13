import { describe, expect, it } from "vitest";
import { compareCharacterSlugs } from "./characterOrder";

describe("compareCharacterSlugs", () => {
  it("uses the configured roster order", () => {
    expect(["ryu", "luke", "jamie"].sort(compareCharacterSlugs)).toEqual(["luke", "jamie", "ryu"]);
  });

  it("places future characters immediately before random", () => {
    expect(["random", "future-fighter", "yasmine"].sort(compareCharacterSlugs)).toEqual([
      "yasmine",
      "future-fighter",
      "random",
    ]);
  });

  it("normalizes known Buckler aliases", () => {
    expect(compareCharacterSlugs("gouki", "dictater")).toBeLessThan(0);
    expect(compareCharacterSlugs("ehonda", "blanka")).toBeLessThan(0);
  });
});
