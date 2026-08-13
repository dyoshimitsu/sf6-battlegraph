import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const extensionRoot = new URL("../../extension/", import.meta.url);

function readContentScript(fileName: string): string {
  return readFileSync(new URL(fileName, extensionRoot), "utf8");
}

describe("connector content scripts", () => {
  it("can share a content-script execution context without redeclaring constants", () => {
    const window = {
      location: {
        hash: "#sf6-battlegraph-origin=https%3A%2F%2Fexample.test",
        origin: "https://www.streetfighter.com",
        pathname: "/6/buckler/ja-jp/profile/1000000001/battlelog",
      },
      addEventListener: () => undefined,
      postMessage: () => undefined,
    };
    const context = {
      URLSearchParams,
      chrome: {
        runtime: {
          getManifest: () => ({ version: "1.1.1" }),
          onMessage: { addListener: () => undefined },
          sendMessage: () => undefined,
        },
      },
      window,
    };

    expect(() => {
      runInNewContext(readContentScript("auth-watcher.js"), context);
      runInNewContext(readContentScript("buckler-bridge.js"), context);
      runInNewContext(readContentScript("app-bridge.js"), context);
    }).not.toThrow();
  });
});
