(() => {
  const START_TYPE = "sf6-battlegraph.collector-start";
  const RESULT_TYPE = "sf6-battlegraph.collector-result";
  const STATUS_TYPE = "sf6-battlegraph.collector-status";
  const PING_TYPE = "sf6-battlegraph.connector-ping";
  const READY_TYPE = "sf6-battlegraph.connector-ready";

  function announceVersion() {
    window.postMessage(
      { type: READY_TYPE, version: chrome.runtime.getManifest().version },
      window.location.origin,
    );
  }

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.type !== START_TYPE
    )
      return;
    chrome.runtime.sendMessage(event.data);
  });

  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.origin === window.location.origin &&
      event.data?.type === PING_TYPE
    )
      announceVersion();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === RESULT_TYPE || message?.type === STATUS_TYPE)
      window.postMessage(message, window.location.origin);
  });

  announceVersion();
})();
