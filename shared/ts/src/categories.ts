/**
 * Preset channel categories that participate in the viewer's global preference
 * scope. The canonical list lives in docs/CHANNEL_CATEGORIES.md; this file is
 * the machine-readable mirror.
 */

export const CUSTOM_CATEGORY = "custom" as const;

/** Frozen tuple so this is statically typed in addition to runtime checked. */
export const PRESET_CATEGORIES = Object.freeze([
  "mic",
  "game",
  "music",
  "voicechat",
  "notifications",
  "browser",
  "alerts",
  "tts",
] as const);

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export type Category = PresetCategory | typeof CUSTOM_CATEGORY;

export function isPresetCategory(value: string): value is PresetCategory {
  return (PRESET_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Lowercase ASCII kebab-case sluggifier. Used for custom channel labels →
 * stable identifiers on the wire. Idempotent and total: any input string
 * yields a slug containing only [a-z0-9-].
 */
export function sluggify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug rule: 1..64 chars, [a-z0-9-], no leading/trailing dash, no double dash. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= 64 && SLUG_RE.test(slug);
}
