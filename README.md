# StreamMix

[![CI](https://github.com/erenisci/streammix/actions/workflows/ci.yml/badge.svg)](https://github.com/erenisci/streammix/actions/workflows/ci.yml)

> An open-source system that lets Twitch and Kick viewers independently control each audio source in a stream — **mic, game, music, notifications, browser, voice chat** — turning down what they don't want, keeping what they do.

---

## The Problem

In a livestream every sound comes mixed into a single audio track. If you don't like one of the components — say the streamer's background music or notification sounds — your only option is muting the whole tab, which also takes out the mic and game audio. There's no granular control on the viewer side.

## The Solution

A three-part system:

- **Publisher** — Runs on the streamer's machine. Captures up to 8 named sources (Mic, Game, Music, Notifications, ...) straight from the processes that produce them and publishes each as a clean Opus side-channel. The main broadcast is untouched, and no OBS reconfiguration is needed.
- **Relay** — A stateless WebSocket fan-out: one publisher in, N viewers out, bytes forwarded opaquely.
- **Browser extension** — Runs in the viewer's browser. Uses the side-channels to **actively cancel** the corresponding sounds out of the main broadcast (phase cancellation), then exposes a separate slider per channel. Preferences are remembered both globally (by category) and per-streamer.

For viewers **without** the extension nothing changes — the broadcast plays as a single mixed stream, the way it always did.

## Architecture

```
[Streamer PC]                  [Relay]                  [Viewer Browser]
  OBS ─ Normal broadcast → Twitch/Kick ──────────────────► (mixed audio)
                                                          Twitch/Kick player
  Publisher ──────► WebSocket ──► fan-out ──► Extension ──► Web Audio:
   (per-process                                              ├─ Demux tracks
    capture, N named                                         ├─ Σ cancel
    channels, multiplexed)                                   └─ Per-channel mixer
```

## Components

| Folder                     | Purpose                                                                                                          | Language   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| [publisher/](publisher/)   | **Streamer path (MVP).** Standalone Windows CLI — captures per-process audio (WASAPI) and publishes to the relay | C++        |
| [obs-plugin/](obs-plugin/) | OBS Studio plugin — packaged streamer experience (v0.2)                                                          | C++        |
| [relay/](relay/)           | WebSocket fan-out server — bridges streamer to viewers                                                           | Go         |
| [extension/](extension/)   | Chromium + Firefox extension — mixer UI + cancellation                                                           | TypeScript |
| [shared/](shared/)         | Shared audio packet format and protocol definitions                                                              | -          |
| [deploy/](deploy/)         | Turnkey relay deploy — Docker Compose + Caddy with automatic TLS                                                 | YAML       |
| [docs/](docs/)             | All documentation                                                                                                | Markdown   |

## Quick Links

- **Streamer setup:** [docs/STREAMER_SETUP.md](docs/STREAMER_SETUP.md)
- **Viewer setup:** [docs/VIEWER_SETUP.md](docs/VIEWER_SETUP.md)
- **Run a relay:** [deploy/](deploy/README.md) · [docs/RELAY_SELFHOST.md](docs/RELAY_SELFHOST.md)
- **Audio protocol:** [docs/AUDIO_PROTOCOL.md](docs/AUDIO_PROTOCOL.md)
- **Channel categories:** [docs/CHANNEL_CATEGORIES.md](docs/CHANNEL_CATEGORIES.md)
- **Contributing:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)

## Status

**Pre-release — not yet usable without building it yourself.** The wire-format codec, the relay, the Windows publisher, and the extension (Opus decode + active cancellation + mixer UI) are all code-complete, and the relay deploy stack is verified end to end against a live host. What is still missing for v0.1:

- **No official hosted relay.** You must run your own ([deploy/](deploy/README.md)); the publisher and every viewer must point at the same URL.
- **No released binaries.** No signed publisher installer, no Chrome Web Store / AMO listing — build from source.
- **End-to-end testing on real streams is not finished.**
- **Sync is manual.** Fingerprint-based auto-sync isn't implemented; viewers nudge an offset slider.
- **Publisher is Windows-only** and has no auto-reconnect.

The OBS plugin ([obs-plugin/](obs-plugin/)) is deferred to v0.2 — the publisher CLI covers the MVP streamer path.

## Supported Platforms

- Twitch (`twitch.tv`)
- Kick (`kick.com`)

## License

[MIT](LICENSE) — © 2026 Eren İşci
