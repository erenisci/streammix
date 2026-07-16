# Streamer Setup

> Running the publisher lets **viewers who have the extension** independently control the audio sources in your stream (mic, game, music, notifications, ...). For viewers without the extension, nothing about your broadcast changes.

The MVP streamer path is the **standalone publisher CLI** (`publisher/`). It captures each audio source straight from the process that produces it, so **your OBS setup needs no changes at all** — the publisher runs alongside OBS and never touches your broadcast.

> The polished OBS dock (`obs-plugin/`) is planned for v0.2. Until then, use the CLI below.

## Requirements

- **Windows 10 build 20348+ or Windows 11** — the WASAPI process-loopback API is Windows-only
- One separate application per audio component (game, Spotify, Discord, ...)
- A relay to publish to — the [`deploy/`](../deploy/README.md) stack, or any host from [RELAY_SELFHOST.md](RELAY_SELFHOST.md)

## 1. Get the publisher

> **No signed installer yet.** Build from source for now:

```powershell
vcpkg install opus:x64-windows libwebsockets:x64-windows

cd publisher
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
```

Binary: `publisher/build/Release/streammix_publisher.exe`

## 2. Get a publisher token

Tokens are minted by the relay operator and are **scoped to one channel**. If you run the `deploy/` stack:

```bash
docker compose exec relay /usr/local/bin/relay token \
  --channel twitch:your_channel --ttl 8760h --config /etc/streammix/config.yaml
```

(`--ttl` is a Go duration — hours are the largest unit, so `8760h` is a year.)

## 3. Run it

```powershell
.\publisher\build\Release\streammix_publisher.exe `
  --relay wss://your-relay.example.org `
  --channel twitch:your_channel `
  --token <TOKEN> `
  --track music:Spotify.exe `
  --track game:game.exe
```

| Flag        | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `--relay`   | Relay WebSocket URL (`wss://...` in production, `ws://` local) |
| `--channel` | `twitch:<name>` or `kick:<name>` — must match your stream      |
| `--token`   | The token from step 2                                          |
| `--track`   | One per audio source, repeatable (max **8**, see ADR-001)      |
| `--bitrate` | Opus kbps per track, default `48`, range `16`–`128`            |

### Track spec syntax

- `<preset>:<exe>` — preset is one of `mic|game|music|voicechat|notifications|browser|alerts|tts`, matched to a running process by exe name (case-insensitive)
- `<preset>:system` — captures the whole system output mix
- `custom:<Label>|<exe>` — free-form label, slug auto-derived

> **Important:** each track must carry **only** the component it represents. Point a track at a mixed source and cancellation breaks — the viewer's slider won't do what it says.

### Typical setups

**Minimal (2 tracks)** — the common case:

| Track spec           | Why                      |
| -------------------- | ------------------------ |
| `music:Spotify.exe`  | Background music         |
| `game:game.exe`      | Game audio               |

**Fuller (4 tracks):**

| Track spec               |
| ------------------------ |
| `game:game.exe`          |
| `music:Spotify.exe`      |
| `voicechat:Discord.exe`  |
| `browser:chrome.exe`     |

Your mic usually goes through OBS rather than a process of its own, so it is often left out until the OBS plugin lands.

## 4. Point viewers at the relay

If you are not using an official hosted relay, viewers must set the same relay URL: extension popup → custom relay URL → `wss://your-relay.example.org`.

## Verification

1. Start the publisher — it prints `sent HELLO + TRACK_LIST (N tracks)` then a `sent=... queue=... dropped=...` line every 5s. `sent` climbing ≈ 50 packets/sec/track means audio is flowing.
2. Start your stream.
3. On another device, open your channel in an extension-enabled browser.
4. Click the mixer icon next to the player — the track list should arrive.
5. Drop a slider to 0 → that audio should drop away; the others keep playing.

You can also point `tools/mock-subscriber` at the channel and watch the `AudioOpus` counters climb.

## Troubleshooting

**Publisher exits immediately with an auth error**

- The token is channel-scoped — it must match `--channel` exactly, lowercase.
- Tokens expire. Mint a new one.

**`sent` stays at 0 for a track**

- The exe name must match a **running** process (`Spotify.exe`, not `Spotify`).
- That process must actually be playing audio — a silent app produces no packets.

**Publisher stops when the connection drops**

- Known limitation: there is no auto-reconnect yet, the process exits. Wrap it in a supervisor/restart script.

**Cancellation is poor, music still audible**

- The track's source must be clean — no extra effects on the way to the broadcast.
- Nudge the offset slider in the mixer. Automatic fingerprint sync is not wired up yet, so the delay is currently manual.

## Performance

Per track: ~50 packets/sec, `--bitrate` kbps of upload (default 48), plus protocol overhead.

| Tracks | Upload      |
| ------ | ----------- |
| 1      | ~52 kbps    |
| 3      | ~156 kbps   |
| 5      | ~260 kbps   |
| 8      | ~416 kbps   |

The publisher does not touch your broadcast — it only adds this extra upload.

## Current limitations

- **Windows only** — macOS (CoreAudio) and Linux (PipeWire) are roadmap items
- **No auto-reconnect** — the publisher exits if the relay drops
- **No fingerprints yet** — the viewer's sync offset is a manual slider for now
- **Stereo 48 kHz Opus** only
