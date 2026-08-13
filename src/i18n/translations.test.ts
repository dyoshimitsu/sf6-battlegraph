import { describe, expect, it } from "vitest";
import { translations } from "./translations";

describe("translations", () => {
  it("keeps Japanese and English dictionaries in sync", () => {
    expect(Object.keys(translations.en).sort()).toEqual(
      Object.keys(translations.ja).sort(),
    );
  });

  it("keeps interpolation variables compatible", () => {
    const variables = (value: string) =>
      Array.from(value.matchAll(/\{([^}]+)\}/g), (match) => match[1]).sort();

    for (const key of Object.keys(translations.ja) as Array<keyof typeof translations.ja>) {
      expect(variables(translations.en[key]), key).toEqual(
        variables(translations.ja[key]),
      );
    }
  });
});
