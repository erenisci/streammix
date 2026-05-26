import {
  HEADER_BYTES,
  MAGIC,
  MAX_PAYLOAD_BYTES,
  MAX_TRACK_SLOT,
  MessageType,
} from "./constants.js";
import { ProtocolError } from "./errors.js";

export interface Frame {
  type: MessageType;
  track: number;
  flags: number;
  seq: number;
  timestampMs: bigint;
  payload: Uint8Array;
}

const KNOWN_TYPES = new Set<number>(Object.values(MessageType).filter((v) => typeof v === "number") as number[]);

/**
 * Encode a frame as a single binary message. Performs bounds checking on every
 * field — never produces a frame the decoder would reject.
 */
export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.payload.length > MAX_PAYLOAD_BYTES) {
    throw new ProtocolError(
      `payload too large: ${frame.payload.length} > ${MAX_PAYLOAD_BYTES}`,
      "TOO_LARGE",
    );
  }
  if (frame.track < 0 || frame.track > MAX_TRACK_SLOT) {
    throw new ProtocolError(`invalid track slot: ${frame.track}`, "BAD_TRACK");
  }
  if (frame.flags < 0 || frame.flags > 0xff) {
    throw new ProtocolError(`flags out of range: ${frame.flags}`, "BAD_PAYLOAD");
  }
  if (frame.seq < 0 || frame.seq > 0xffffffff) {
    throw new ProtocolError(`seq out of uint32 range: ${frame.seq}`, "BAD_PAYLOAD");
  }
  if (frame.timestampMs < 0n || frame.timestampMs > 0xffffffffffffffffn) {
    throw new ProtocolError(`timestamp out of uint64 range`, "BAD_PAYLOAD");
  }

  const buf = new Uint8Array(HEADER_BYTES + frame.payload.length);
  const view = new DataView(buf.buffer);

  buf.set(MAGIC, 0);
  buf[4] = frame.type;
  buf[5] = frame.track;
  buf[6] = frame.flags;
  view.setUint16(7, frame.payload.length, false); // big-endian
  view.setUint32(9, frame.seq, false);
  view.setBigUint64(13, frame.timestampMs, false);
  buf.set(frame.payload, HEADER_BYTES);

  return buf;
}

/**
 * Decode a frame from raw bytes. Strictly validates every field; rejects
 * unknown message types so callers can decide whether to drop them gracefully.
 */
export function decodeFrame(input: Uint8Array): Frame {
  if (input.length < HEADER_BYTES) {
    throw new ProtocolError(
      `frame shorter than header: ${input.length} < ${HEADER_BYTES}`,
      "BAD_LENGTH",
    );
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (input[i] !== MAGIC[i]) {
      throw new ProtocolError("magic mismatch", "BAD_MAGIC");
    }
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const type = input[4]!;
  const track = input[5]!;
  const flags = input[6]!;
  const payloadLen = view.getUint16(7, false);
  const seq = view.getUint32(9, false);
  const timestampMs = view.getBigUint64(13, false);

  if (payloadLen > MAX_PAYLOAD_BYTES) {
    throw new ProtocolError(`payload too large: ${payloadLen}`, "TOO_LARGE");
  }
  if (HEADER_BYTES + payloadLen !== input.length) {
    throw new ProtocolError(
      `length mismatch: declared ${payloadLen}, got ${input.length - HEADER_BYTES}`,
      "BAD_LENGTH",
    );
  }
  if (track > MAX_TRACK_SLOT) {
    throw new ProtocolError(`invalid track slot: ${track}`, "BAD_TRACK");
  }
  if (!KNOWN_TYPES.has(type)) {
    throw new ProtocolError(`unknown message type: 0x${type.toString(16)}`, "BAD_TYPE");
  }

  return {
    type: type as MessageType,
    track,
    flags,
    seq,
    timestampMs,
    payload: input.slice(HEADER_BYTES, HEADER_BYTES + payloadLen),
  };
}
