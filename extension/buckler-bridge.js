const RESULT_TYPE = "sf6-battlegraph.collector-result";

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== RESULT_TYPE) return;
  chrome.runtime.sendMessage(event.data);
});
