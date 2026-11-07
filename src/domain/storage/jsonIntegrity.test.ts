import { describe, expect, it } from "vitest";
import { canonicalJson } from "./jsonIntegrity";

describe("canonicalJson", () => {
  it("orders keys with English collation regardless of the runtime locale", () => {
    const value = { b: 1, _next: 2, B: 3, a_b: 4, aB: 5, ab: 6, aa: { z: 1, Z: 2 } };
    const expected = '{"_next":2,"a_b":4,"aa":{"z":1,"Z":2},"ab":6,"aB":5,"b":1,"B":3}';
    expect(canonicalJson(value)).toBe(expected);
    const keys = Object.keys(value);
    expect([...keys].sort((left, right) => left.localeCompare(right, "ja"))).toEqual(
      [...keys].sort((left, right) => left.localeCompare(right, "en")),
    );
  });
});
