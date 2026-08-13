import { Timestamp } from "firebase/firestore/lite";
import { describe, expect, it } from "vitest";
import { reviveFirestoreData } from "./firestoreRestorePort";

describe("reviveFirestoreData", () => {
  it("restores nested JSON timestamp tags to Firestore Timestamp values", () => {
    const restored = reviveFirestoreData({
      values: [{ type: "firestore/timestamp/1.0", seconds: 123, nanoseconds: 456 }],
    }) as { values: Timestamp[] };
    expect(restored.values[0]).toBeInstanceOf(Timestamp);
    expect(restored.values[0].seconds).toBe(123);
    expect(restored.values[0].nanoseconds).toBe(456);
  });

  it("does not convert malformed timestamp-shaped objects", () => {
    const value = { type: "firestore/timestamp/1.0", seconds: "123", nanoseconds: 0 };
    expect(reviveFirestoreData(value)).toEqual(value);
  });
});
