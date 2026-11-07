importScripts("background-policy.js");

const START_TYPE = "sf6-battlegraph.collector-start";
const RESULT_TYPE = "sf6-battlegraph.collector-result";
const STATUS_TYPE = "sf6-battlegraph.collector-status";
const requestKey = (tabId) => `request:${tabId}`;

async function rememberRequest(sourceTabId, targetTabId) {
  await chrome.storage.session.set({ [requestKey(sourceTabId)]: targetTabId });
}

async function findTargetTab(sourceTabId) {
  const key = requestKey(sourceTabId);
  return (await chrome.storage.session.get(key))[key];
}

async function forgetRequest(sourceTabId) {
  await chrome.storage.session.remove(requestKey(sourceTabId));
}

async function reportStartError(targetTabId, reason) {
  await chrome.tabs
    .sendMessage(targetTabId, {
      type: STATUS_TYPE,
      version: 1,
      status: "error",
      message: `Could not open the Buckler tab: ${reason}`,
    })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === START_TYPE && sender.tab?.id !== undefined) {
    const targetTabId = sender.tab.id;
    if (!Sf6BattlegraphBackgroundPolicy.isBucklerBattleLogUrl(message.url)) {
      void reportStartError(targetTabId, "the requested URL is not a Buckler Battle Log page");
      return;
    }
    void (async () => {
      let sourceTabId;
      try {
        const tab = await chrome.tabs.create({ url: "about:blank", active: false });
        if (tab.id === undefined) throw new Error("Buckler tab ID was not available");
        sourceTabId = tab.id;
        await rememberRequest(sourceTabId, targetTabId);
        await chrome.tabs.update(sourceTabId, { url: message.url });
      } catch (error) {
        if (sourceTabId !== undefined) {
          await forgetRequest(sourceTabId).catch(() => {});
          await chrome.tabs.remove(sourceTabId).catch(() => {});
        }
        await reportStartError(targetTabId, error instanceof Error ? error.message : String(error));
      }
    })();
    return;
  }
  if (message?.type === RESULT_TYPE && sender.tab?.id !== undefined) {
    const sourceTabId = sender.tab.id;
    void (async () => {
      const targetTabId = await findTargetTab(sourceTabId);
      if (targetTabId === undefined) return;
      // Close the collection tab even when Battlegraph is gone; the bundle cannot be delivered.
      await chrome.tabs.sendMessage(targetTabId, message).catch(() => {});
      await forgetRequest(sourceTabId).catch(() => {});
      await chrome.tabs.remove(sourceTabId).catch(() => {});
    })().catch(() => {});
  }
  if (message?.type === STATUS_TYPE && sender.tab?.id !== undefined) {
    const sourceTabId = sender.tab.id;
    void (async () => {
      const targetTabId = await findTargetTab(sourceTabId);
      if (targetTabId === undefined) return;
      await chrome.tabs.sendMessage(targetTabId, message);
      if (Sf6BattlegraphBackgroundPolicy.shouldActivateBucklerTab(message.status))
        await chrome.tabs.update(sourceTabId, { active: true });
    })().catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetRequest(tabId);
});
