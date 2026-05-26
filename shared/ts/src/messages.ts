import { CUSTOM_CATEGORY, isPresetCategory, isValidSlug, type Category } from "./categories.js";
import { MAX_TRACK_SLOT, MessageType } from "./constants.js";
import { isErrorCode, ProtocolError, type ErrorCode } from "./errors.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

// ---------- HELLO ----------

export interface HelloPayload {
  version: 1;
  client: string;
  audio: {
    codec: "opus";
    sampleRate: 48000;
    channels: 1 | 2;
    frameMs: 20;
  };
}

export function encodeHello(p: HelloPayload): Uint8Array {
  return encodeJson({
    version: p.version,
    client: p.client,
    audio: {
      codec: p.audio.codec,
      sample_rate: p.audio.sampleRate,
      channels: p.audio.channels,
      frame_ms: p.audio.frameMs,
    },
  });
}

export function decodeHello(buf: Uint8Array): HelloPayload {
  const obj = decodeJson(buf);
  if (obj.version !== 1) throw bad("hello.version");
  const client = strField(obj, "client", 128);
  const audio = obj.audio;
  if (!audio || typeof audio !== "object") throw bad("hello.audio");
  if (audio.codec !== "opus") throw bad("hello.audio.codec");
  if (audio.sample_rate !== 48000) throw bad("hello.audio.sample_rate");
  if (audio.channels !== 1 && audio.channels !== 2) throw bad("hello.audio.channels");
  if (audio.frame_ms !== 20) throw bad("hello.audio.frame_ms");
  return {
    version: 1,
    client,
    audio: { codec: "opus", sampleRate: 48000, channels: audio.channels, frameMs: 20 },
  };
}

// ---------- TRACK_LIST ----------

export interface TrackInfo {
  id: number;
  slug: string;
  category: Category;
  label: string;
}

export interface TrackListPayload {
  tracks: TrackInfo[];
}

export function encodeTrackList(p: TrackListPayload): Uint8Array {
  return encodeJson({ tracks: p.tracks });
}

export function decodeTrackList(buf: Uint8Array): TrackListPayload {
  const obj = decodeJson(buf);
  if (!Array.isArray(obj.tracks)) throw bad("track_list.tracks");
  if (obj.tracks.length > MAX_TRACK_SLOT) throw bad("track_list too many tracks");

  const tracks: TrackInfo[] = [];
  const seen = new Set<number>();
  for (const raw of obj.tracks) {
    if (!raw || typeof raw !== "object") throw bad("track entry");
    const id = raw.id;
    if (!Number.isInteger(id) || id < 1 || id > MAX_TRACK_SLOT) throw bad("track.id");
    if (seen.has(id)) throw bad("track.id duplicate");
    seen.add(id);

    const slug = strField(raw, "slug", 64);
    if (!isValidSlug(slug)) throw bad("track.slug format");

    const category = strField(raw, "category", 32);
    if (category !== CUSTOM_CATEGORY && !isPresetCategory(category)) throw bad("track.category");

    const label = strField(raw, "label", 64);
    tracks.push({ id, slug, category: category as Category, label });
  }
  return { tracks };
}

// ---------- FINGERPRINT ----------

export interface FingerprintPayload {
  hash: bigint;
  windowMs: number;
}

export function encodeFingerprint(p: FingerprintPayload): Uint8Array {
  const buf = new Uint8Array(10);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, p.hash, false);
  view.setUint16(8, p.windowMs, false);
  return buf;
}

export function decodeFingerprint(buf: Uint8Array): FingerprintPayload {
  if (buf.length !== 10) throw bad("fingerprint length");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { hash: view.getBigUint64(0, false), windowMs: view.getUint16(8, false) };
}

// ---------- TRACK_META ----------

export interface TrackMetaPayload {
  title?: string;
  artist?: string;
  albumArtUrl?: string;
}

export function encodeTrackMeta(p: TrackMetaPayload): Uint8Array {
  const out: Record<string, string> = {};
  if (p.title !== undefined) out.title = p.title;
  if (p.artist !== undefined) out.artist = p.artist;
  if (p.albumArtUrl !== undefined) out.album_art_url = p.albumArtUrl;
  return encodeJson(out);
}

export function decodeTrackMeta(buf: Uint8Array): TrackMetaPayload {
  const obj = decodeJson(buf);
  const out: TrackMetaPayload = {};
  if (obj.title !== undefined) out.title = strField(obj, "title", 256);
  if (obj.artist !== undefined) out.artist = strField(obj, "artist", 256);
  if (obj.album_art_url !== undefined) {
    const u = strField(obj, "album_art_url", 1024);
    if (!u.startsWith("https://")) throw bad("album_art_url must be https");
    out.albumArtUrl = u;
  }
  return out;
}

// ---------- STATS ----------

export interface StatsPayload {
  uptimeS: number;
  packetsSent: number;
  subscribers: number;
  tracksActive: number;
}

export function encodeStats(p: StatsPayload): Uint8Array {
  return encodeJson({
    uptime_s: p.uptimeS,
    packets_sent: p.packetsSent,
    subscribers: p.subscribers,
    tracks_active: p.tracksActive,
  });
}

export function decodeStats(buf: Uint8Array): StatsPayload {
  const obj = decodeJson(buf);
  return {
    uptimeS: numField(obj, "uptime_s"),
    packetsSent: numField(obj, "packets_sent"),
    subscribers: numField(obj, "subscribers"),
    tracksActive: numField(obj, "tracks_active"),
  };
}

// ---------- SUB_TRACKS ----------

export interface SubTracksPayload {
  tracks: number[];
}

export function encodeSubTracks(p: SubTracksPayload): Uint8Array {
  return encodeJson({ tracks: p.tracks });
}

export function decodeSubTracks(buf: Uint8Array): SubTracksPayload {
  const obj = decodeJson(buf);
  if (!Array.isArray(obj.tracks)) throw bad("sub_tracks");
  if (obj.tracks.length > MAX_TRACK_SLOT) throw bad("sub_tracks too many");
  const tracks: number[] = [];
  const seen = new Set<number>();
  for (const id of obj.tracks) {
    if (!Number.isInteger(id) || id < 1 || id > MAX_TRACK_SLOT) throw bad("sub_tracks.id");
    if (seen.has(id)) throw bad("sub_tracks.id duplicate");
    seen.add(id);
    tracks.push(id);
  }
  return { tracks };
}

// ---------- ERROR ----------

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export function encodeError(p: ErrorPayload): Uint8Array {
  return encodeJson({ code: p.code, message: p.message });
}

export function decodeError(buf: Uint8Array): ErrorPayload {
  const obj = decodeJson(buf);
  const code = strField(obj, "code", 32);
  if (!isErrorCode(code)) throw bad("error.code");
  const message = strField(obj, "message", 512);
  return { code, message };
}

// ---------- helpers ----------

const MAX_JSON_BYTES = 4096;

function encodeJson(value: unknown): Uint8Array {
  const out = encoder.encode(JSON.stringify(value));
  if (out.length > MAX_JSON_BYTES) {
    throw new ProtocolError(`json payload too large: ${out.length}`, "TOO_LARGE");
  }
  return out;
}

function decodeJson(buf: Uint8Array): Record<string, unknown> & { [k: string]: any } {
  if (buf.length > MAX_JSON_BYTES) {
    throw new ProtocolError(`json payload too large: ${buf.length}`, "TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(buf));
  } catch {
    throw new ProtocolError("invalid json or utf-8", "BAD_PAYLOAD");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProtocolError("payload must be a json object", "BAD_PAYLOAD");
  }
  return parsed as Record<string, unknown> & { [k: string]: any };
}

function strField(obj: Record<string, unknown>, key: string, maxLen: number): string {
  const v = obj[key];
  if (typeof v !== "string") throw bad(`field ${key} must be string`);
  if (v.length > maxLen) throw bad(`field ${key} too long`);
  return v;
}

function numField(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw bad(`field ${key} must be non-negative finite number`);
  return v;
}

function bad(detail: string): ProtocolError {
  return new ProtocolError(`malformed payload: ${detail}`, "BAD_PAYLOAD");
}

// Re-export MessageType for callers that want to dispatch.
export { MessageType };
