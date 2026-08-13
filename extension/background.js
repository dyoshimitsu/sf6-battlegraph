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

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === START_TYPE && sender.tab?.id !== undefined) {
    const targetTabId = sender.tab.id;
    chrome.tabs
      .create({ url: message.url, active: false })
      .then((tab) => {
        if (tab.id !== undefined) return rememberRequest(tab.id, targetTabId);
      })
      .catch((error) =>
        chrome.tabs.sendMessage(targetTabId, {
          type: STATUS_TYPE,
          version: 1,
          status: "error",
          message: `Could not open the Buckler tab: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    return;
  }
  if (message?.type === RESULT_TYPE && sender.tab?.id !== undefined) {
    const sourceTabId = sender.tab.id;
    findTargetTab(sourceTabId).then((targetTabId) => {
      if (targetTabId === undefined) return;
      return chrome.tabs
        .sendMessage(targetTabId, message)
        .then(() => forgetRequest(sourceTabId))
        .then(() => chrome.tabs.remove(sourceTabId));
    });
  }
  if (message?.type === STATUS_TYPE && sender.tab?.id !== undefined) {
    const sourceTabId = sender.tab.id;
    findTargetTab(sourceTabId).then((targetTabId) => {
      if (targetTabId === undefined) return;
      return chrome.tabs.sendMessage(targetTabId, message).then(() => {
        if (Sf6BattlegraphBackgroundPolicy.shouldActivateBucklerTab(message.status))
          return chrome.tabs.update(sourceTabId, { active: true });
      });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetRequest(tabId);
});
