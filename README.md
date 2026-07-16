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
- **Browser extension** — Runs in the viewer's browser. Uses the side-channels to **actively cancel** the corresponding sounds out of the main broadcast (phase cancellation), then exposes a separate slider per channel. Preferences are remembered both globally (by category) and per-streamer. *(Cancellation is the experimental part — see Status.)*

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

**Pre-release, and the core feature is unproven.** Everything is built — wire-format codec, relay, Windows publisher, extension with Opus decode, cancellation graph and mixer UI — the pieces talk to each other, the relay is deployed and verified against a live host, and CI is green. What has *not* happened is anyone hearing a slider actually silence a streamer's music on a real stream.

Be clear-eyed about why that matters:

- **Cancellation is experimental.** Subtracting the side-channel from the broadcast only works if the two are aligned to within tens of microseconds. Today the viewer sets that alignment with a slider, by hand, against a broadcast running 3–30 seconds behind. Automatic sync is designed but not built, so expect cancellation to be poor or absent until it is. The per-track sliders work as a plain mixer regardless.
- **No official hosted relay.** Run your own ([deploy/](deploy/README.md)); publisher and viewers must point at the same URL.
- **No released binaries.** No signed installer, no Chrome Web Store / AMO listing — build from source.
- **Publisher is Windows-only** (WASAPI process loopback).

The OBS plugin ([obs-plugin/](obs-plugin/)) is deferred to v0.2 — the publisher CLI covers the MVP streamer path.

## Supported Platforms

- Twitch (`twitch.tv`)
- Kick (`kick.com`)

## License

[MIT](LICENSE) — © 2026 Eren İşci
