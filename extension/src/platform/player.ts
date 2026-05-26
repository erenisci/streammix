/**
 * Locate the platform's video player element and the control bar to graft
 * the mixer icon onto.
 *
 * Both Twitch and Kick re-render their players after SPA navigation, so we
 * never cache a reference — every call queries fresh.
 */

import type { Platform } from "./detect.js";

export interface PlayerHooks {
  /** The <video> element whose audio we'll tap. */
  video: HTMLVideoElement;
  /** The container we mount the mixer icon next to (volume control area). */
  controlBar: HTMLElement;
}

const TWITCH_SELECTORS = {
  video: "video[playsinline]",
  controlBar: "[data-a-target='player-controls']",
};

const KICK_SELECTORS = {
  // Kick wraps the player; the <video> is straightforward.
  video: "video",
  // Kick's control bar selector is brittle; this is a best-effort default.
  controlBar: ".vjs-control-bar",
};

export function findPlayer(platform: Platform): PlayerHooks | null {
  const sel = platform === "twitch" ? TWITCH_SELECTORS : KICK_SELECTORS;
  const video = document.querySelector<HTMLVideoElement>(sel.video);
  const controlBar = document.querySelector<HTMLElement>(sel.controlBar);
  if (!video || !controlBar) return null;
  return { video, controlBar };
}

/**
 * Wait for the player to appear (it usually comes after the SPA hydrates).
 * Resolves with the hooks or null after timeoutMs.
 */
export function waitForPlayer(platform: Platform, timeoutMs = 15000): Promise<PlayerHooks | null> {
  return new Promise((resolve) => {
    const found = findPlayer(platform);
    if (found) return resolve(found);

    const start = Date.now();
    const obs = new MutationObserver(() => {
      const hooks = findPlayer(platform);
      if (hooks) {
        obs.disconnect();
        resolve(hooks);
      } else if (Date.now() - start > timeoutMs) {
        obs.disconnect();
        resolve(null);
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });
  });
}
