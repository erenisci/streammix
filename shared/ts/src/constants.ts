/**
 * Wire-format constants for the StreamMix protocol.
 * Canonical spec: docs/AUDIO_PROTOCOL.md (internal).
 */

/** ASCII "SMX1" — the first four bytes of every frame. */
export const MAGIC = new Uint8Array([0x53, 0x4d, 0x58, 0x31]);

/** Subprotocol identifier announced during WebSocket upgrade. */
export const SUBPROTOCOL = "streammix.v1";

/** Total bytes in the frame header (MAGIC..TIMESTAMP_MS). */
export const HEADER_BYTES = 21;

/**
 * Maximum payload size we will parse from the wire (DoS bound).
 * Opus frames at 20ms / 48kbps are ~120 bytes; JSON payloads (TRACK_LIST) bigger
 * but still small. 4 KiB is generous and safe.
 */
export const MAX_PAYLOAD_BYTES = 4096;

/** Highest track slot that may carry audio (0x00 is reserved for control). */
export const MAX_TRACK_SLOT = 0x08;

/** Hard cap on simultaneously active tracks per publisher (ADR-001). */
export const MAX_TRACKS = 8;

/**
 * Message type byte. Unknown values are dropped silently on the receiver side
 * to keep forward compatibility.
 */
export enum MessageType {
  Hello = 0x01,
  TrackList = 0x02,
  AudioOpus = 0x03,
  Fingerprint = 0x04,
  TrackMeta = 0x05,
  Stats = 0x10,
  SubTracks = 0x20,
  Error = 0xff,
}

/** Track slot reserved for control messages (HELLO, TRACK_LIST, STATS, ...). */
export const CONTROL_TRACK = 0x00;
