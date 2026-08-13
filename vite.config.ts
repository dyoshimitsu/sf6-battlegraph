import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const connectorManifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "serve-connector-package",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split("?", 1)[0] !== "/sf6-battlegraph-extension.zip") return next();
          try {
            const archive = readFileSync(resolve("dist/sf6-battlegraph-extension.zip"));
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/zip");
            response.setHeader("Content-Length", archive.byteLength);
            response.end(archive);
          } catch {
            response.statusCode = 404;
            response.end("Connector package is missing. Run npm run build first.");
          }
        });
      },
    },
  ],
  define: { __CONNECTOR_VERSION__: JSON.stringify(connectorManifest.version) },
  test: {
    environment: "node",
  },
});
