/**
 * Background service worker (MV3).
 *
 * Currently lightweight: we'd put cross-tab relay coordination here later
 * (e.g. dedupe subscribers across tabs of the same channel). For Phase 3 it
 * just keeps the worker alive long enough for chrome.storage events.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.debug("[StreamMix] background installed");
});
