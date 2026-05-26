# StreamMix

> An open-source system that lets Twitch and Kick viewers independently control each audio source in a stream — **mic, game, music, notifications, browser, voice chat** — turning down what they don't want, keeping what they do.

---

## The Problem

In a livestream every sound comes mixed into a single audio track. If you don't like one of the components — say the streamer's background music or notification sounds — your only option is muting the whole tab, which also takes out the mic and game audio. There's no granular control on the viewer side.

## The Solution

A two-part system:

- **OBS plugin** — Runs on the streamer's machine. The streamer defines up to 8 named channels (Mic, Game, Music, Notifications, ...) and the plugin publishes each as a clean PCM side-channel. The main broadcast is unchanged.
- **Browser extension** — Runs in the viewer's browser. Uses the side-channels to **actively cancel** the corresponding sounds out of the main broadcast (phase cancellation), then exposes a separate slider per channel. Preferences are remembered both globally (by category) and per-streamer.

For viewers **without** the extension nothing changes — the broadcast plays as a single mixed stream, the way it always did.

## Architecture

```
[Streamer PC]                  [Relay]                  [Viewer Browser]
  OBS                                                    Twitch/Kick player
   ├─ Normal broadcast → Twitch/Kick ─────────────────────► (mixed audio)
   └─ OBS Plugin ──► WebSocket ──► fan-out ──► Extension ──► Web Audio:
        (N named                                              ├─ Demux tracks
         channels,                                             ├─ Σ cancel
         multiplexed)                                          └─ Per-channel mixer
```

## Components

| Folder                     | Purpose                                                              | Language   |
| -------------------------- | -------------------------------------------------------------------- | ---------- |
| [obs-plugin/](obs-plugin/) | OBS Studio plugin — publishes named audio channels to a side-channel | C++        |
| [relay/](relay/)           | WebSocket fan-out server — bridges streamer to viewers               | Go         |
| [extension/](extension/)   | Chromium + Firefox extension — mixer UI + cancellation               | TypeScript |
| [shared/](shared/)         | Shared audio packet format and protocol definitions                  | -          |
| [docs/](docs/)             | All documentation                                                    | Markdown   |

## Quick Links

- **Streamer setup:** [docs/STREAMER_SETUP.md](docs/STREAMER_SETUP.md)
- **Viewer setup:** [docs/VIEWER_SETUP.md](docs/VIEWER_SETUP.md)
- **Relay self-host:** [docs/RELAY_SELFHOST.md](docs/RELAY_SELFHOST.md)
- **Audio protocol:** [docs/AUDIO_PROTOCOL.md](docs/AUDIO_PROTOCOL.md)
- **Channel categories:** [docs/CHANNEL_CATEGORIES.md](docs/CHANNEL_CATEGORIES.md)
- **Contributing:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## Status

> Early development. No installable release yet.

## Supported Platforms

- Twitch (`twitch.tv`)
- Kick (`kick.com`)

## License

MIT
