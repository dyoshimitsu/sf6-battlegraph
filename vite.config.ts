import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

const connectorManifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __CONNECTOR_VERSION__: JSON.stringify(connectorManifest.version) },
  test: {
    environment: "node",
  },
});
