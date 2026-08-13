const RESULT_TYPE = "sf6-battlegraph.collector-result";
const STATUS_TYPE = "sf6-battlegraph.collector-status";

window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    ![RESULT_TYPE, STATUS_TYPE].includes(event.data?.type)
  )
    return;
  chrome.runtime.sendMessage(event.data);
});
