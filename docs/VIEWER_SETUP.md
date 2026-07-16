# Viewer Setup

## Installation

> **Not yet released.** No store listing exists yet — build from source (`cd extension && npm install && npm run build`) and load `extension/dist` as an unpacked extension.

When released:

- **Chrome / Edge / Brave / Opera:** Chrome Web Store — "StreamMix"
- **Firefox:** Mozilla AMO — "StreamMix"

## Point it at a relay

**There is no official hosted relay yet.** Until there is, open the extension popup and set the **custom relay URL** to the same `wss://...` host the streamer publishes to — otherwise the mixer will never receive a channel list. See [RELAY_SELFHOST.md](RELAY_SELFHOST.md).

## Usage

1. Open any stream on Twitch or Kick.
2. A new **mixer icon** appears next to the volume control.
3. Click it — the **channel list** the streamer defined opens, with a separate slider + mute + solo for each channel.

### Example Panel

```
┌──────────────────────────────────────┐
│  🎚  Mixer                     [⚙ ✕] │
├──────────────────────────────────────┤
│  🎤 Microphone      ▓▓▓▓▓▓▓░░░  55  │
│  🎮 Game            ▓▓░░░░░░░░  10  │
│  🎵 Music           ▓▓▓▓░░░░░░  40  │
│  🔔 Notifications   ░░░░░░░░░░   0  │
│  🌐 Browser         ▓▓▓░░░░░░░  30  │
├──────────────────────────────────────┤
│  📺 Broadcast (residual) ▓▓░░░░  20 │
├──────────────────────────────────────┤
│  [Reset]   [Save for this streamer]  │
└──────────────────────────────────────┘
```

### Slider Logic

| Slider | What it controls |
|---|---|
| **Microphone, Game, Music, ...** | Each named channel the streamer opens (up to 8) |
| **📺 Broadcast (residual)** | Whatever remains in the main broadcast after cancellation — keep this low; setting it to 0 silences unknown leftovers too |

### Mute / Solo

- **Mute (click the track icon):** that sound disappears entirely (slider 0 + cancellation)
- **Solo (Shift+click):** only that track, everything else 0. Click again to revert.

## Preference Memory

Your settings are stored in **two tiers**:

1. **Global (by category):** Once you set `music=40`, that becomes the default at every streamer who opens a music channel.
2. **Per-streamer:** If you set `music=80` at a specific streamer, that only sticks for them. Others keep the global 40.

**Custom channels** (free-form names not in the preset list) are only remembered per-streamer.

Example scenario:

- Streamer A: you set mic=55, game=10, music=40
- Streamer B (3 channels: mic, game, music): opens with 55, 10, 40 automatically
- Streamer C (4 channels: mic, game, music, notifications): mic, game, music are again 55, 10, 40; notifications uses your global default (if you've set one)

## When the Streamer Isn't Publishing

The channel list comes back empty. You just get the classic single mute button — same as before extension installation.

## Want to Listen to Your Own Music?

StreamMix doesn't play music for you — use your favorite music app (Spotify, YouTube Music, Apple Music, etc.) alongside the stream. Turn the streamer's "Music" channel to 0 here, raise your music app's volume to taste. Future versions may integrate music apps directly; for now they live side by side.

## Fine Tuning

**Cancellation isn't perfectly clean** — if a sound is still faintly audible:

1. Mixer panel → ⚙ Settings
2. Drag the **Manual Offset** slider
3. Stop at the cleanest point

The stream reaches you **seconds** later than the side-channel does, and that delay is what the offset compensates for — expect a large value (roughly 3–5s on Twitch low latency, 10–20s otherwise), not a small nudge.

> **Be realistic about this slider.** Cancellation needs the two signals aligned to within microseconds, and the slider steps in 10ms. Finding a usable point by hand ranges from hard to impossible; automatic sync is designed but not built yet. Until it is, treat cancellation as experimental — per-track sliders and mute still work as a normal mixer over whatever the streamer publishes.

> **Not yet available:** marking a track "Permanently Off" so it is never pulled from the relay (a bandwidth saving) is designed but not implemented — turning a slider to 0 still downloads the track.

## Privacy

- No viewer data is sent to a server.
- All settings are in `chrome.storage.local` — fully local.

## Troubleshooting

**Mixer icon doesn't appear**

- Refresh the page (F5)
- Make sure the extension has permission on this page (puzzle icon → permissions)

**Channel list is empty**

- The streamer isn't running the publisher, or is publishing to a different relay than the one set in your popup. Without a publisher the extension can only offer a classic mute.

**Some channels show up but certain sounds still come from the main broadcast**

- The streamer may not have separated every audio source (e.g. notifications not on their own channel)
- The "📺 Broadcast (residual)" slider controls those leftovers

**Audio stutters**

- The scheduler keeps a small jitter buffer; there is no user-facing buffer setting yet. Stutter usually means the side-channel is losing packets — check the streamer's upload and the relay's `relay_bytes_relayed_total` metric.
