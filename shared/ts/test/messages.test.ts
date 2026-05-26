import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_CATEGORY,
  PRESET_CATEGORIES,
  decodeError,
  decodeFingerprint,
  decodeHello,
  decodeStats,
  decodeSubTracks,
  decodeTrackList,
  decodeTrackMeta,
  encodeError,
  encodeFingerprint,
  encodeHello,
  encodeStats,
  encodeSubTracks,
  encodeTrackList,
  encodeTrackMeta,
  isPresetCategory,
  isValidSlug,
  sluggify,
} from "../src/index.js";

describe("categories", () => {
  it("preset list has 8 entries", () => {
    assert.equal(PRESET_CATEGORIES.length, 8);
  });

  it("isPresetCategory checks membership", () => {
    assert.ok(isPresetCategory("mic"));
    assert.ok(isPresetCategory("music"));
    assert.ok(!isPresetCategory("custom"));
    assert.ok(!isPresetCategory("MUSIC"));
    assert.ok(!isPresetCategory("foo"));
  });

  it("sluggify produces lowercase kebab-case ASCII", () => {
    assert.equal(sluggify("Co-host Mic"), "co-host-mic");
    assert.equal(sluggify("My Channel!"), "my-channel");
    assert.equal(sluggify("   trim   me  "), "trim-me");
    assert.equal(sluggify("Müzik"), "muzik");
  });

  it("isValidSlug enforces the slug rule", () => {
    assert.ok(isValidSlug("mic"));
    assert.ok(isValidSlug("co-host-mic"));
    assert.ok(isValidSlug("a"));
    assert.ok(!isValidSlug(""));
    assert.ok(!isValidSlug("MIC"));
    assert.ok(!isValidSlug("-leading"));
    assert.ok(!isValidSlug("trailing-"));
    assert.ok(!isValidSlug("double--dash"));
    assert.ok(!isValidSlug("x".repeat(65)));
  });
});

describe("HELLO", () => {
  it("round-trips", () => {
    const p = {
      version: 1 as const,
      client: "extension/0.1.0",
      audio: { codec: "opus" as const, sampleRate: 48000 as const, channels: 2 as const, frameMs: 20 as const },
    };
    assert.deepEqual(decodeHello(encodeHello(p)), p);
  });

  it("rejects wrong version", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ version: 2, client: "x", audio: { codec: "opus", sample_rate: 48000, channels: 2, frame_ms: 20 } }));
    assert.throws(() => decodeHello(buf), /hello.version/);
  });

  it("rejects non-opus codec", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ version: 1, client: "x", audio: { codec: "aac", sample_rate: 48000, channels: 2, frame_ms: 20 } }));
    assert.throws(() => decodeHello(buf), /codec/);
  });

  it("rejects client string longer than 128", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ version: 1, client: "x".repeat(129), audio: { codec: "opus", sample_rate: 48000, channels: 2, frame_ms: 20 } }));
    assert.throws(() => decodeHello(buf), /client/);
  });
});

describe("TRACK_LIST", () => {
  it("round-trips", () => {
    const p = {
      tracks: [
        { id: 1, slug: "mic", category: "mic" as const, label: "Microphone" },
        { id: 2, slug: "co-host-mic", category: CUSTOM_CATEGORY, label: "Co-host" },
      ],
    };
    assert.deepEqual(decodeTrackList(encodeTrackList(p)), p);
  });

  it("rejects duplicate track id", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ tracks: [
      { id: 1, slug: "mic", category: "mic", label: "A" },
      { id: 1, slug: "game", category: "game", label: "B" },
    ] }));
    assert.throws(() => decodeTrackList(buf), /duplicate/);
  });

  it("rejects more than 8 tracks", () => {
    const tracks = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, slug: `t${i}`, category: "custom", label: `T${i}`,
    }));
    const buf = new TextEncoder().encode(JSON.stringify({ tracks }));
    assert.throws(() => decodeTrackList(buf), /too many/);
  });

  it("rejects invalid slug format", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ tracks: [
      { id: 1, slug: "MIC!", category: "mic", label: "A" },
    ] }));
    assert.throws(() => decodeTrackList(buf), /slug format/);
  });

  it("rejects unknown non-custom category", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ tracks: [
      { id: 1, slug: "foo", category: "synthwave", label: "Foo" },
    ] }));
    assert.throws(() => decodeTrackList(buf), /category/);
  });
});

describe("FINGERPRINT", () => {
  it("round-trips with bigint hash", () => {
    const p = { hash: 0x0123456789abcdefn, windowMs: 1000 };
    assert.deepEqual(decodeFingerprint(encodeFingerprint(p)), p);
  });

  it("rejects wrong length", () => {
    assert.throws(() => decodeFingerprint(new Uint8Array(9)), /length/);
    assert.throws(() => decodeFingerprint(new Uint8Array(11)), /length/);
  });
});

describe("TRACK_META", () => {
  it("round-trips optional fields", () => {
    const p = { title: "Song", artist: "Artist", albumArtUrl: "https://example.com/art.jpg" };
    assert.deepEqual(decodeTrackMeta(encodeTrackMeta(p)), p);
  });

  it("works with no fields", () => {
    assert.deepEqual(decodeTrackMeta(encodeTrackMeta({})), {});
  });

  it("rejects non-https album art URL", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ album_art_url: "http://example.com/art.jpg" }));
    assert.throws(() => decodeTrackMeta(buf), /https/);
  });
});

describe("STATS", () => {
  it("round-trips", () => {
    const p = { uptimeS: 100, packetsSent: 5000, subscribers: 12, tracksActive: 3 };
    assert.deepEqual(decodeStats(encodeStats(p)), p);
  });

  it("rejects negative values", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ uptime_s: -1, packets_sent: 0, subscribers: 0, tracks_active: 0 }));
    assert.throws(() => decodeStats(buf), /non-negative/);
  });
});

describe("SUB_TRACKS", () => {
  it("round-trips", () => {
    const p = { tracks: [1, 2, 3] };
    assert.deepEqual(decodeSubTracks(encodeSubTracks(p)), p);
  });

  it("accepts empty list", () => {
    assert.deepEqual(decodeSubTracks(encodeSubTracks({ tracks: [] })), { tracks: [] });
  });

  it("rejects duplicates", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ tracks: [1, 1] }));
    assert.throws(() => decodeSubTracks(buf), /duplicate/);
  });

  it("rejects out-of-range ids", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ tracks: [9] }));
    assert.throws(() => decodeSubTracks(buf), /id/);
  });
});

describe("ERROR", () => {
  it("round-trips", () => {
    const p = { code: "AUTH_FAILED" as const, message: "bad token" };
    assert.deepEqual(decodeError(encodeError(p)), p);
  });

  it("rejects unknown error code", () => {
    const buf = new TextEncoder().encode(JSON.stringify({ code: "GREMLINS", message: "uh oh" }));
    assert.throws(() => decodeError(buf), /code/);
  });
});

describe("payload security", () => {
  it("rejects JSON that isn't an object", () => {
    const arr = new TextEncoder().encode(JSON.stringify([1, 2, 3]));
    assert.throws(() => decodeStats(arr), /json object/);
    const str = new TextEncoder().encode(JSON.stringify("hi"));
    assert.throws(() => decodeStats(str), /json object/);
  });

  it("rejects invalid UTF-8", () => {
    const bad = new Uint8Array([0xff, 0xfe, 0xfd]);
    assert.throws(() => decodeStats(bad), /invalid json|utf-8/i);
  });
});
