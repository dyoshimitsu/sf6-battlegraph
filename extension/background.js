const START_TYPE = "sf6-battlegraph.collector-start";
const RESULT_TYPE = "sf6-battlegraph.collector-result";
const requests = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === START_TYPE && sender.tab?.id !== undefined) {
    chrome.tabs.create({ url: message.url }).then((tab) => {
      if (tab.id !== undefined) requests.set(tab.id, sender.tab.id);
    });
    return;
  }
  if (message?.type === RESULT_TYPE && sender.tab?.id !== undefined) {
    const targetTabId = requests.get(sender.tab.id);
    if (targetTabId === undefined) return;
    requests.delete(sender.tab.id);
    chrome.tabs.sendMessage(targetTabId, message);
  }
});
