import { describe, expect, it } from "vitest";
import { buildConnectorMatchPatterns } from "./connectorOrigins";

describe("buildConnectorMatchPatterns", () => {
  it("converts configured deployment origins into Chrome match patterns", () => {
    expect(buildConnectorMatchPatterns("https://alice.github.io,http://localhost:5173")).toEqual([
      "https://alice.github.io/*",
      "http://localhost:5173/*",
    ]);
  });

  it("deduplicates origins", () => {
    expect(buildConnectorMatchPatterns("https://example.com,https://example.com")).toEqual(["https://example.com/*"]);
  });

  it("rejects paths and unsupported protocols", () => {
    expect(() => buildConnectorMatchPatterns("https://example.com/project")).toThrow("Invalid connector origin");
    expect(() => buildConnectorMatchPatterns("chrome-extension://abc")).toThrow("Invalid connector origin");
  });
});
