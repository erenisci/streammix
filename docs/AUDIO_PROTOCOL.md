# Audio Protocol

This document defines the wire format between the OBS plugin (publisher), the relay, and the extension (subscriber). The plugin and extension must conform to this contract; the relay is an opaque bridge.

## Transport

- WebSocket (RFC 6455), binary frames
- TLS required (`wss://`)
- Subprotocol: `streammix.v1`

## Endpoint Layout

| Role       | Path                                | Auth         |
| ---------- | ----------------------------------- | ------------ |
| Publisher  | `/publish?channel=<ch>&token=<tok>` | Bearer token |
| Subscriber | `/subscribe?channel=<ch>`           | none         |

Channel format: `<platform>:<channel_name>`, lowercase. Examples: `twitch:shroud`, `kick:trainwreckstv`.

## Track Multiplexing

A single WebSocket connection carries **multiple tracks**. Each audio packet is stamped with a `track_id`. Track ID values:

- `0x00` — control messages (HELLO, TRACK_LIST, STATS, ERROR)
- `0x01`–`0x08` — audio track slots (8 limit)
- `0x09`–`0xFF` — reserved

The track ↔ slug mapping is announced via the `TRACK_LIST` message.

## Message Frame

Every binary WebSocket message follows this layout:

```
0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  MAGIC (4 bytes: "SMX1")                                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| TYPE  | TRACK | FLAGS |   PAYLOAD_LEN (uint16 BE)              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| SEQ (uint32 BE)                                                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| TIMESTAMP_MS (uint64 BE)                                        |
|                                                                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| PAYLOAD ...                                                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

- `MAGIC`: 4 bytes constant, `"SMX1"`
- `TYPE`: 1 byte, message type (see below)
- `TRACK`: 1 byte, track slot (`0x00`–`0x08`)
- `FLAGS`: 1 byte, reserved (currently 0)
- `PAYLOAD_LEN`: 2 bytes big-endian, payload length
- `SEQ`: 4 bytes big-endian, per-channel monotonically increasing sequence number
- `TIMESTAMP_MS`: 8 bytes big-endian, publisher capture timestamp

Total header: **21 bytes**.

## Message Types

| TYPE   | Name        | Track         | Direction                          | Description                                   |
| ------ | ----------- | ------------- | ---------------------------------- | --------------------------------------------- |
| `0x01` | HELLO       | `0x00`        | both                               | Initial handshake, capability negotiation     |
| `0x02` | TRACK_LIST  | `0x00`        | publisher → subscriber             | Active track list (sent on every change)      |
| `0x03` | AUDIO_OPUS  | `0x01`–`0x08` | publisher → subscriber             | Opus-encoded audio frame                      |
| `0x04` | FINGERPRINT | `0x01`–`0x08` | publisher → subscriber             | Perceptual hash for sync                      |
| `0x05` | TRACK_META  | `0x01`–`0x08` | publisher → subscriber             | Track metadata (e.g. "now playing" for music) |
| `0x10` | STATS       | `0x00`        | bidirectional                      | Health / latency report                       |
| `0x20` | SUB_TRACKS  | `0x00`        | subscriber → publisher (via relay) | Track IDs the subscriber actually wants       |
| `0xFF` | ERROR       | `0x00`        | server → client                    | Error code + message                          |

## HELLO Payload

```json
{
  "version": 1,
  "client": "obs-plugin/0.1.0" | "extension/0.1.0",
  "audio": {
    "codec": "opus",
    "sample_rate": 48000,
    "channels": 2,
    "frame_ms": 20
  }
}
```

UTF-8 JSON. Versioned: if a client or server doesn't match, the connection is closed with `ERROR`.

## TRACK_LIST Payload

```json
{
  "tracks": [
    {
      "id": 1,
      "slug": "mic",
      "category": "mic",
      "label": "Microphone"
    },
    {
      "id": 2,
      "slug": "game",
      "category": "game",
      "label": "Valorant"
    },
    {
      "id": 3,
      "slug": "music",
      "category": "music",
      "label": "Spotify"
    },
    {
      "id": 4,
      "slug": "co-host-mic",
      "category": "custom",
      "label": "Co-host Mic"
    }
  ]
}
```

- `id`: track slot (1–8)
- `slug`: stable identifier (preset slug, or normalized name for custom)
- `category`: standard category slug or `"custom"` (see [CHANNEL_CATEGORIES.md](CHANNEL_CATEGORIES.md))
- `label`: display name shown to viewers

When the streamer adds or removes a channel, a fresh `TRACK_LIST` is sent. The extension diffs against the previous one.

## AUDIO_OPUS Payload

Raw Opus packet. Decoder configuration comes from HELLO. One packet = one Opus frame.

- `TRACK`: identifies which track this belongs to
- `SEQ`: per-track monotonic, used for loss detection
- `TIMESTAMP_MS`: relative to the publisher's audio capture start

## FINGERPRINT Payload

Sent once per second, separately per track. The extension keeps an independent fingerprint history per track, but synchronization runs through **one shared delay** (all tracks mix into the same RTMP broadcast — they share the same latency).

```
+---+---+---+---+---+---+---+---+
| FP_HASH (uint64 BE)            |
+---+---+---+---+---+---+---+---+
| WINDOW_MS (uint16 BE)          |
+---+---+
```

- `FP_HASH`: perceptual hash (Chromaprint-like)
- `WINDOW_MS`: length of the hash window in ms (typically 1000)

Fingerprints from every track are correlated with the mixed-audio fingerprint of the main broadcast to derive a shared delay. A single track's fingerprint can be enough (the loudest one usually gives the best result).

## TRACK_META Payload (optional)

Shape varies by track type. Example (music category):

```json
{
  "title": "Track title",
  "artist": "Artist",
  "album_art_url": "https://..."
}
```

Shown in the extension UI (e.g. "Streamer is now playing: ..."). The streamer can opt out.

## SUB_TRACKS Payload (bandwidth optimization)

The subscriber declares which tracks it actually wants. The plugin only publishes the requested tracks (if the user permanently turned a track off, those packets are never sent).

```json
{
  "tracks": [1, 2, 3]
}
```

Empty `[]` = control messages only (temporary full mute).

> Note: There may be many subscribers; the union is taken. The publisher sends every track requested by at least one subscriber. With a single viewer you get full optimization; with many viewers in practice every track ends up requested.

## STATS Payload

```json
{
  "uptime_s": 1234,
  "packets_sent": 56789,
  "subscribers": 42,
  "tracks_active": 4
}
```

## ERROR Payload

```json
{
  "code": "AUTH_FAILED" | "CHANNEL_TAKEN" | "VERSION_MISMATCH" | "RATE_LIMIT" | "TRACK_LIMIT",
  "message": "human-readable"
}
```

`TRACK_LIMIT`: the streamer tried to open more than 8 tracks.

The connection is closed after an error.

## Bandwidth Budget

Per track: Opus 48 kbps stereo + 21-byte header @ 50 fps = ~52 kbps + ~96 bps fingerprint = ~52 kbps.

| Track count | Streamer upload | Viewer download (single viewer) |
| ----------- | --------------- | ------------------------------- |
| 1           | ~52 kbps        | ~52 kbps                        |
| 3           | ~156 kbps       | ~156 kbps                       |
| 5           | ~260 kbps       | ~260 kbps                       |
| 8 (max)     | ~416 kbps       | ~416 kbps                       |

Streamer side is constant (independent of subscriber count). Relay egress = `streamer bitrate × subscriber count`.

## Backward Compatibility

- Subprotocol version (`streammix.v1`) bumps on major changes
- Header MAGIC is always `SMX1` (throughout v1)
- Adding new TYPE values is backward compatible — unknown types are silently dropped by the subscriber
- Adding new preset category slugs is backward compatible — older extensions display them as custom
