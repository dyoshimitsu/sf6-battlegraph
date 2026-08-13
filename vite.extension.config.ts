import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import { buildConnectorMatchPatterns } from "./build/connectorOrigins.js";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist/extension",
    emptyOutDir: true,
    lib: {
      entry: "src/collector/entry.ts",
      name: "Sf6BattlegraphConnector",
      formats: ["iife"],
      fileName: () => "collector.js",
    },
    minify: true,
    rollupOptions: {
      plugins: [{
        name: "extension-manifest",
        generateBundle() {
          const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as { content_scripts: Array<{ js: string[]; matches: string[] }> };
          const appBridge = manifest.content_scripts.find(script => script.js.includes("app-bridge.js"));
          if (!appBridge) throw new Error("app-bridge content script was not found");
          appBridge.matches = buildConnectorMatchPatterns(loadEnv(mode, process.cwd(), "").VITE_CONNECTOR_ORIGINS);
          this.emitFile({ type: "asset", fileName: "manifest.json", source: `${JSON.stringify(manifest, null, 2)}\n` });
          for (const fileName of ["app-bridge.js", "buckler-bridge.js", "auth-watcher.js", "background.js"]) {
            this.emitFile({ type: "asset", fileName, source: readFileSync(`extension/${fileName}`, "utf8") });
          }
        },
      }],
    },
  },
  publicDir: false,
}));
