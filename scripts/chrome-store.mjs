import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function compareVersions(left, right) {
  const parse = (value) => {
    if (typeof value !== "string" || !/^\d+(\.\d+){0,3}$/.test(value))
      throw new Error("Invalid extension version");
    const result = value.split(".").map(Number);
    if (result.some((part) => !Number.isSafeInteger(part) || part > 65535))
      throw new Error("Invalid extension version");
    return result;
  };
  const a = parse(left),
    b = parse(right);
  for (let i = 0; i < 4; i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? 1 : -1;
  return 0;
}

export function checkStatus(status, expectedVersion) {
  compareVersions(expectedVersion, expectedVersion);
  if (status.takenDown || status.warned)
    throw new Error("Store item has a policy warning or takedown; inspect dashboard");
  const published = status.publishedItemRevisionStatus;
  if (!published || !["PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(published.state))
    throw new Error("Item must already be published before automation");
  const channels = published.distributionChannels;
  if (!Array.isArray(channels) || channels.length === 0)
    throw new Error("Published version is unavailable");
  const versions = channels.map((channel) => channel.crxVersion);
  if (versions.some((version) => compareVersions(expectedVersion, version) < 0))
    throw new Error("Local extension version is older than the store version");
  if (versions.every((version) => compareVersions(expectedVersion, version) === 0))
    return "unchanged";
  if (status.submittedItemRevisionStatus)
    throw new Error("An existing submission must be handled in the dashboard before uploading");
  if (status.lastAsyncUploadState === "IN_PROGRESS")
    throw new Error("A store upload is already in progress");
  return "upload";
}

export async function submitStoreUpdate({
  fetcher = fetch,
  token,
  publisherId,
  itemId,
  version,
  zip,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!token || !/^[a-zA-Z0-9_-]+$/.test(publisherId) || !/^[a-p]{32}$/.test(itemId))
    throw new Error("Invalid store configuration");
  const name = `publishers/${publisherId}/items/${itemId}`;
  const endpoint = `https://chromewebstore.googleapis.com/v2/${name}`;
  async function request(url, options = {}) {
    const response = await fetcher(url, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) throw new Error(`Chrome Web Store API returned HTTP ${response.status}`);
    return response.json();
  }
  const status = await request(`${endpoint}:fetchStatus`);
  if (checkStatus(status, version) === "unchanged") return "unchanged";
  const upload = await request(
    `https://chromewebstore.googleapis.com/upload/v2/${name}:upload?uploadType=media`,
    { method: "POST", headers: { "content-type": "application/zip" }, body: zip },
  );
  if (upload.itemId !== itemId) throw new Error("Upload response item ID mismatch; do not publish");
  if (upload.crxVersion && compareVersions(upload.crxVersion, version) !== 0)
    throw new Error("Uploaded version mismatch; do not publish");
  let uploadState = upload.uploadState;
  for (let attempt = 0; uploadState === "IN_PROGRESS" && attempt < 12; attempt++) {
    await wait(5000);
    const latest = await request(`${endpoint}:fetchStatus`);
    if (latest.submittedItemRevisionStatus || latest.takenDown || latest.warned)
      throw new Error("Store status changed during upload; do not publish");
    uploadState = latest.lastAsyncUploadState;
  }
  if (uploadState !== "SUCCEEDED")
    throw new Error(
      `Upload not confirmed (${uploadState ?? "unknown"}); inspect dashboard before retrying`,
    );
  const result = await request(`${endpoint}:publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blockOnWarnings: true }),
  });
  if (result.itemId !== itemId || result.state !== "PENDING_REVIEW")
    throw new Error("Submission response was unexpected; inspect the dashboard");
  return "submitted";
}

async function main() {
  const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
  const version = manifest.version;
  compareVersions(version, version);
  const zip = await readFile(`dist/sf6-battlegraph-connector-store-v${version}.zip`);
  const result = await submitStoreUpdate({
    token: process.env.CHROME_STORE_TOKEN,
    publisherId: process.env.CHROME_STORE_PUBLISHER_ID,
    itemId: process.env.CHROME_STORE_ITEM_ID,
    version,
    zip,
  });
  console.log(
    result === "unchanged"
      ? "Store version is already published; no changes made."
      : `Version ${version} submitted for review.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
