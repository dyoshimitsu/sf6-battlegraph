import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release versions", () => {
  it("keeps the application and connector versions aligned", () => {
    const application = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const connector = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as {
      version: string;
    };
    expect(connector.version).toBe(application.version);
  });
});
