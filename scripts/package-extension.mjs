import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const source = resolve(dist, "extension");
const staging = resolve(dist, ".extension-package");
const { version } = JSON.parse(readFileSync(resolve(root, "extension/manifest.json"), "utf8"));
const folderName = `sf6-battlegraph-connector-v${version}`;
const output = resolve(dist, `${folderName}.zip`);
const storeOutput = resolve(dist, `sf6-battlegraph-connector-store-v${version}.zip`);

rmSync(staging, { recursive: true, force: true });
for (const fileName of readdirSync(dist)) {
  if (
    fileName === "sf6-battlegraph-extension.zip" ||
    /^sf6-battlegraph-connector-v\d+\.\d+\.\d+\.zip$/.test(fileName)
  )
    rmSync(resolve(dist, fileName));
}
mkdirSync(staging, { recursive: true });
cpSync(source, resolve(staging, folderName), { recursive: true });
execFileSync("zip", ["-q", "-r", output, folderName], { cwd: staging });
execFileSync("zip", ["-q", "-r", "-FS", storeOutput, "."], { cwd: source });
rmSync(staging, { recursive: true, force: true });
