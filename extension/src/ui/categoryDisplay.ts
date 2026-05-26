import type { Category } from "@streammix/shared";

const ICONS: Record<string, string> = {
  mic: "🎤",
  game: "🎮",
  music: "🎵",
  voicechat: "💬",
  notifications: "🔔",
  browser: "🌐",
  alerts: "📣",
  tts: "🗣",
};

const LABELS: Record<string, string> = {
  mic: "Microphone",
  game: "Game",
  music: "Music",
  voicechat: "Voice Chat",
  notifications: "Notifications",
  browser: "Browser",
  alerts: "Stream Alerts",
  tts: "TTS / Donations",
};

export function categoryIcon(c: Category): string {
  return ICONS[c] ?? "🔊";
}

export function categoryLabel(c: Category): string {
  return LABELS[c] ?? "Channel";
}
