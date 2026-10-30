import { describe, expect, it } from "vitest";
import { hasCollectionConsent, rememberCollectionConsent } from "./collectionConsentStorage";

describe("collection consent persistence", () => {
  const scope = {
    adminUid: "admin",
    playerUserCode: 123,
    projectId: "project",
    visibility: "public" as const,
  };
  it("remembers consent only for the same admin and deployment", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    expect(hasCollectionConsent(storage, scope)).toBe(false);
    rememberCollectionConsent(storage, scope);
    expect(hasCollectionConsent(storage, scope)).toBe(true);
    expect(hasCollectionConsent(storage, { ...scope, visibility: "private" })).toBe(false);
    expect(hasCollectionConsent(storage, { ...scope, adminUid: "other" })).toBe(false);
    expect(hasCollectionConsent(storage, { ...scope, projectId: "other" })).toBe(false);
    expect(hasCollectionConsent(storage, { ...scope, playerUserCode: 456 })).toBe(false);
  });
  it("asks again if storage cannot be used", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberCollectionConsent(storage, scope)).not.toThrow();
    expect(hasCollectionConsent(storage, scope)).toBe(false);
  });
});
