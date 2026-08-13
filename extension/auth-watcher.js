const TARGET_PARAMETER = "sf6-battlegraph-origin";
const STATUS_TYPE = "sf6-battlegraph.collector-status";
const isCollectionRequest = new URLSearchParams(window.location.hash.replace(/^#/, "")).has(TARGET_PARAMETER);
const isBattleLog = /\/profile\/\d+\/battlelog(?:\/|$)/.test(window.location.pathname);

if (isCollectionRequest && !isBattleLog) {
  chrome.runtime.sendMessage({ type: STATUS_TYPE, version: 1, status: "authentication-required" });
}
