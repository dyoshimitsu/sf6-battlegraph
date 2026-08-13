const START_TYPE = "sf6-battlegraph.collector-start";
const RESULT_TYPE = "sf6-battlegraph.collector-result";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== START_TYPE) return;
  chrome.runtime.sendMessage(event.data);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === RESULT_TYPE) window.postMessage(message, window.location.origin);
});
