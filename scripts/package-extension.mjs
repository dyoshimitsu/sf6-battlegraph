import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const source = resolve(dist, "extension");
const staging = resolve(dist, ".extension-package");
const output = resolve(dist, "sf6-battlegraph-extension.zip");
const { version } = JSON.parse(readFileSync(resolve(root, "extension/manifest.json"), "utf8"));
const folderName = `sf6-battlegraph-connector-v${version}`;

rmSync(staging, { recursive: true, force: true });
rmSync(output, { force: true });
mkdirSync(staging, { recursive: true });
cpSync(source, resolve(staging, folderName), { recursive: true });
execFileSync("zip", ["-q", "-r", output, folderName], { cwd: staging });
rmSync(staging, { recursive: true, force: true });
