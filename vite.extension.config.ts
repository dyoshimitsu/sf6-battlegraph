import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
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
          this.emitFile({ type: "asset", fileName: "manifest.json", source: readFileSync("extension/manifest.json", "utf8") });
        },
      }],
    },
  },
  publicDir: false,
});
