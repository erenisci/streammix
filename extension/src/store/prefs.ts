/**
 * Two-tier preference store.
 *
 *   Global:        per category slug, applies at every streamer
 *   Per-streamer:  override that wins where present
 *
 * Custom (non-preset) categories live only in the per-streamer scope; they're
 * never written to the global store.
 */

import { isPresetCategory, type Category } from "@streammix/shared";

const GLOBAL_KEY = "prefs.global";
const STREAMER_KEY_PREFIX = "prefs.streamer.";

export interface ChannelSetting {
  /** Slider value 0..1. */
  gain: number;
  /** Mute (true → effective gain 0 regardless of slider). */
  muted: boolean;
  /** "Permanently off" — don't even subscribe to this track on the wire. */
  permanentlyOff: boolean;
}

const DEFAULT: ChannelSetting = { gain: 0.5, muted: false, permanentlyOff: false };

/** Per-streamer overrides keyed by track slug. */
export type StreamerPrefs = Record<string, ChannelSetting>;
/** Global defaults keyed by *preset* category slug only. */
export type GlobalPrefs = Record<string, ChannelSetting>;

// MV3 on Firefox now ships the `chrome.*` namespace alongside `browser.*`, so
// we only need one path. If chrome.storage is missing (e.g. in tests) we
// silently no-op.
async function get<T>(key: string, fallback: T): Promise<T> {
  if (!chrome?.storage?.local) return fallback;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items: Record<string, unknown>) => {
      resolve((items[key] as T) ?? fallback);
    });
  });
}

async function set(key: string, value: unknown): Promise<void> {
  if (!chrome?.storage?.local) return;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

export async function loadGlobal(): Promise<GlobalPrefs> {
  return get<GlobalPrefs>(GLOBAL_KEY, {});
}

export async function loadStreamer(channelID: string): Promise<StreamerPrefs> {
  return get<StreamerPrefs>(STREAMER_KEY_PREFIX + channelID, {});
}

export async function saveStreamer(channelID: string, prefs: StreamerPrefs): Promise<void> {
  await set(STREAMER_KEY_PREFIX + channelID, prefs);
}

export async function saveGlobalCategory(category: string, setting: ChannelSetting): Promise<void> {
  if (!isPresetCategory(category)) return; // global scope is preset-only
  const all = await loadGlobal();
  all[category] = setting;
  await set(GLOBAL_KEY, all);
}

/**
 * Compute the effective setting for a track:
 *
 *   per-streamer override (if present) > global category default (preset only) > DEFAULT
 */
export function effectiveSetting(
  trackSlug: string,
  category: Category,
  streamer: StreamerPrefs,
  global: GlobalPrefs,
): ChannelSetting {
  const fromStreamer = streamer[trackSlug];
  if (fromStreamer) return fromStreamer;
  if (category !== "custom") {
    const fromGlobal = global[category];
    if (fromGlobal) return fromGlobal;
  }
  return { ...DEFAULT };
}

export { DEFAULT as DEFAULT_SETTING };
