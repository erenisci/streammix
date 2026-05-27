# publisher

Standalone Windows CLI that captures per-process audio via WASAPI process loopback, encodes each track with Opus, and publishes to the StreamMix relay using `streammix.v1`.

**Language:** C++20
**Platform:** Windows 10 build 20348+ / Windows 11 (process-loopback API)
**Dependencies (vcpkg):** `opus`, `libwebsockets`

## Build

```powershell
cd publisher
cmake -S . -B build `
  -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
```

The binary lands at `publisher/build/Release/streammix_publisher.exe`.

## Run

Mint a publisher token via the relay's CLI first:

```powershell
.\relay\build\relay.exe token --channel twitch:dev --ttl 1h --config dev.yaml
```

Then point the publisher at one or more processes:

```powershell
.\publisher\build\Release\streammix_publisher.exe `
  --relay ws://localhost:8080 `
  --channel twitch:dev `
  --token <TOKEN> `
  --track music:Spotify.exe `
  --track game:vlc.exe
```

### Track spec syntax

- `<preset>:<exe>` — `mic|game|music|voicechat|notifications|browser|alerts|tts` mapped to a running process by exe name (case-insensitive)
- `<preset>:system` — captures the default-output system loopback (full audio mix)
- `custom:<Label>|<exe>` — free-form label; slug is auto-derived

Maximum 8 tracks per publisher (ADR-001).

## What it does

```
Process audio  ──►  WASAPI process loopback  ──►  Opus encode  ──►  WS publish  ──►  relay
(per track)        (per track, own thread)       (per track,        (single conn,        (fan-out)
                                                  20ms frames)       multiplexed)
```

A single WebSocket connection carries all tracks multiplexed by `track_id`. The wire format is exactly the one in `docs/AUDIO_PROTOCOL.md`.

## Limitations / not yet wired

- **Fingerprints** (perceptual hashes for sync) — not generated yet; the extension uses a fallback delay until they land
- **Stereo only** — Opus runs at 48 kHz / 2ch (HELLO declares this)
- **Reconnect** — on connection drop, the publisher exits; supervisor scripts should restart it (proper auto-reconnect comes later)
- **Windows only** — macOS (CoreAudio) and Linux (PipeWire/PulseAudio) ports are in the roadmap

## Verifying

In one terminal, start the relay + this publisher. In another, run `tools/mock-subscriber` against the same channel — you should see the `counts` map for AudioOpus growing at the expected rate (50 packets/sec/track).
