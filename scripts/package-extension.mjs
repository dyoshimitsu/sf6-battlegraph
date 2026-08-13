import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const source = resolve(dist, "extension");
const staging = resolve(dist, ".extension-package");
const { version } = JSON.parse(readFileSync(resolve(root, "extension/manifest.json"), "utf8"));
const folderName = `sf6-battlegraph-connector-v${version}`;
const output = resolve(dist, `${folderName}.zip`);

rmSync(staging, { recursive: true, force: true });
for (const fileName of readdirSync(dist)) {
  if (fileName === "sf6-battlegraph-extension.zip" || /^sf6-battlegraph-connector-v\d+\.\d+\.\d+\.zip$/.test(fileName)) rmSync(resolve(dist, fileName));
}
mkdirSync(staging, { recursive: true });
cpSync(source, resolve(staging, folderName), { recursive: true });
execFileSync("zip", ["-q", "-r", output, folderName], { cwd: staging });
rmSync(staging, { recursive: true, force: true });
