import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/collector/entry.ts",
      name: "Sf6BattlegraphCollector",
      formats: ["iife"],
      fileName: () => "collector.js",
    },
    minify: true,
  },
});
