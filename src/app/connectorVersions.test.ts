import { describe, expect, it } from "vitest";
import { isConnectorCompatible } from "./connectorVersions";

describe("connector compatibility", () => {
  it("allows known compatible versions while a new store update is pending", () => {
    expect(isConnectorCompatible("1.1.3", "1.1.5")).toBe(true);
    expect(isConnectorCompatible("1.1.5", "1.1.5")).toBe(true);
    expect(isConnectorCompatible("1.1.2", "1.1.5")).toBe(false);
    expect(isConnectorCompatible("1.1.6", "1.1.5")).toBe(false);
  });
  it("rejects missing and invalid versions", () => {
    expect(isConnectorCompatible(null, "1.1.5")).toBe(false);
    expect(isConnectorCompatible("1.1.3-beta", "1.1.5")).toBe(false);
    expect(isConnectorCompatible("1.1.3", "invalid")).toBe(false);
  });
});
