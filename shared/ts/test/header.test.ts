import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_BYTES,
  MAGIC,
  MAX_PAYLOAD_BYTES,
  MAX_TRACK_SLOT,
  MessageType,
  decodeFrame,
  encodeFrame,
  ProtocolError,
  type Frame,
} from "../src/index.js";

function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    type: MessageType.AudioOpus,
    track: 1,
    flags: 0,
    seq: 0,
    timestampMs: 0n,
    payload: new Uint8Array(0),
    ...overrides,
  };
}

describe("frame header", () => {
  it("HEADER_BYTES is 21", () => {
    assert.equal(HEADER_BYTES, 21);
  });

  it("MAGIC is 'SMX1'", () => {
    assert.deepEqual(Array.from(MAGIC), [0x53, 0x4d, 0x58, 0x31]);
  });

  it("round-trips an empty audio frame", () => {
    const f = makeFrame({ seq: 42, timestampMs: 1234567890n });
    const encoded = encodeFrame(f);
    assert.equal(encoded.length, HEADER_BYTES);
    const decoded = decodeFrame(encoded);
    assert.equal(decoded.type, f.type);
    assert.equal(decoded.track, f.track);
    assert.equal(decoded.flags, f.flags);
    assert.equal(decoded.seq, f.seq);
    assert.equal(decoded.timestampMs, f.timestampMs);
    assert.equal(decoded.payload.length, 0);
  });

  it("round-trips a frame with payload", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const f = makeFrame({ payload, seq: 7, timestampMs: 99n });
    const decoded = decodeFrame(encodeFrame(f));
    assert.deepEqual(Array.from(decoded.payload), [1, 2, 3, 4, 5]);
  });

  it("encodes fields at exact byte offsets (BE)", () => {
    const f = makeFrame({
      type: MessageType.Hello,
      track: 0,
      flags: 0,
      seq: 0x01020304,
      timestampMs: 0x1122334455667788n,
      payload: new Uint8Array([0xaa]),
    });
    const buf = encodeFrame(f);
    // MAGIC
    assert.deepEqual(Array.from(buf.slice(0, 4)), [0x53, 0x4d, 0x58, 0x31]);
    // TYPE/TRACK/FLAGS
    assert.equal(buf[4], MessageType.Hello);
    assert.equal(buf[5], 0);
    assert.equal(buf[6], 0);
    // PAYLOAD_LEN (BE)
    assert.equal(buf[7], 0);
    assert.equal(buf[8], 1);
    // SEQ (BE)
    assert.deepEqual(Array.from(buf.slice(9, 13)), [0x01, 0x02, 0x03, 0x04]);
    // TIMESTAMP_MS (BE)
    assert.deepEqual(
      Array.from(buf.slice(13, 21)),
      [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88],
    );
    // payload
    assert.equal(buf[21], 0xaa);
  });

  it("rejects frames shorter than header", () => {
    assert.throws(() => decodeFrame(new Uint8Array(10)), /shorter than header/);
  });

  it("rejects bad magic", () => {
    const buf = new Uint8Array(HEADER_BYTES);
    buf[0] = 0x00;
    assert.throws(() => decodeFrame(buf), /magic mismatch/);
  });

  it("rejects mismatched payload length", () => {
    const f = makeFrame({ payload: new Uint8Array([1, 2, 3]) });
    const buf = encodeFrame(f);
    // truncate one byte — declared 3, actual 2
    assert.throws(() => decodeFrame(buf.slice(0, buf.length - 1)), /length mismatch/);
  });

  it("rejects payload above MAX_PAYLOAD_BYTES on decode", () => {
    // Build a header that claims a huge payload but provides no bytes
    const buf = new Uint8Array(HEADER_BYTES);
    buf.set(MAGIC, 0);
    buf[4] = MessageType.AudioOpus;
    buf[5] = 1;
    // declared length = MAX + 1
    const declared = MAX_PAYLOAD_BYTES + 1;
    buf[7] = (declared >> 8) & 0xff;
    buf[8] = declared & 0xff;
    assert.throws(() => decodeFrame(buf), /too large/i);
  });

  it("rejects payload above MAX_PAYLOAD_BYTES on encode", () => {
    const big = new Uint8Array(MAX_PAYLOAD_BYTES + 1);
    assert.throws(() => encodeFrame(makeFrame({ payload: big })), /too large/i);
  });

  it("rejects out-of-range track slot", () => {
    assert.throws(
      () => encodeFrame(makeFrame({ track: MAX_TRACK_SLOT + 1 })),
      /invalid track slot/,
    );
  });

  it("rejects unknown message types on decode", () => {
    const buf = new Uint8Array(HEADER_BYTES);
    buf.set(MAGIC, 0);
    buf[4] = 0x77; // not a known type
    buf[5] = 0;
    buf[7] = 0;
    buf[8] = 0;
    assert.throws(() => decodeFrame(buf), /unknown message type/);
  });

  it("rejects track 0xFF (above MAX_TRACK_SLOT) on decode", () => {
    const buf = new Uint8Array(HEADER_BYTES);
    buf.set(MAGIC, 0);
    buf[4] = MessageType.AudioOpus;
    buf[5] = 0xff;
    buf[7] = 0;
    buf[8] = 0;
    assert.throws(() => decodeFrame(buf), /invalid track slot/);
  });

  it("throws ProtocolError instances (typed)", () => {
    try {
      decodeFrame(new Uint8Array(HEADER_BYTES));
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof ProtocolError);
      assert.equal((e as ProtocolError).code, "BAD_MAGIC");
    }
  });
});
