/**
 * Identify which streaming platform the current tab belongs to, and parse the
 * channel name out of the URL.
 *
 * Twitch URL shape:  https://www.twitch.tv/<channel>
 * Kick URL shape:    https://www.kick.com/<channel>
 *
 * Channels we don't recognise (e.g. directory pages, settings) return null
 * so the extension stays inactive.
 */

export type Platform = "twitch" | "kick";

export interface ChannelLocation {
  platform: Platform;
  channelName: string; // already lowercased, slug-safe
  channelID: string; // "twitch:foo" / "kick:foo" — wire form
}

// Twitch reserved paths that look like channel names but aren't.
const TWITCH_RESERVED = new Set([
  "directory",
  "settings",
  "videos",
  "subscriptions",
  "drops",
  "wallet",
  "search",
  "p",
  "downloads",
  "store",
  "broadcast",
  "turbo",
  "friends",
  "inventory",
]);

const KICK_RESERVED = new Set([
  "browse",
  "categories",
  "search",
  "dashboard",
  "settings",
  "subscriptions",
  "following",
  "messages",
  "vods",
]);

const CHANNEL_NAME_RE = /^[a-z0-9_]{1,64}$/;

export function detectChannel(href: string = location.href): ChannelLocation | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]!.toLowerCase();

  if (host === "twitch.tv") {
    if (TWITCH_RESERVED.has(first)) return null;
    if (!CHANNEL_NAME_RE.test(first)) return null;
    return { platform: "twitch", channelName: first, channelID: `twitch:${first}` };
  }
  if (host === "kick.com") {
    if (KICK_RESERVED.has(first)) return null;
    if (!CHANNEL_NAME_RE.test(first)) return null;
    return { platform: "kick", channelName: first, channelID: `kick:${first}` };
  }
  return null;
}
