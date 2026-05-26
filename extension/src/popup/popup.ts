/**
 * Popup wiring. For Phase 3, just the custom relay URL field.
 */

const RELAY_KEY = "settings.relayURL";

const input = document.getElementById("relay") as HTMLInputElement;

chrome.storage.local.get(RELAY_KEY, (items) => {
  const url = items[RELAY_KEY];
  if (typeof url === "string") input.value = url;
});

input.addEventListener("change", () => {
  const v = input.value.trim();
  if (v === "" || /^wss:\/\/[^\s]+$/.test(v)) {
    chrome.storage.local.set({ [RELAY_KEY]: v });
  }
});
