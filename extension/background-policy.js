globalThis.Sf6BattlegraphBackgroundPolicy = Object.freeze({
  shouldActivateBucklerTab(status) {
    return status === "authentication-required";
  },
  // Only open Buckler Battle Log pages; the start request comes from a page script.
  isBucklerBattleLogUrl(value) {
    try {
      const url = new URL(value);
      return (
        url.origin === "https://www.streetfighter.com" &&
        /^\/6\/buckler\/[a-z]{2}-[a-z]{2}\/profile\/\d+\/battlelog$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  },
});
