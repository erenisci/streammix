# Viewer Setup

## Installation

> **Not yet released.**

When released:

- **Chrome / Edge / Brave / Opera:** Chrome Web Store — "StreamMix"
- **Firefox:** Mozilla AMO — "StreamMix"

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
│  🎧 Your Music     ▓▓▓▓▓░░░░░  50  │
├──────────────────────────────────────┤
│  [Reset]   [Save for this streamer]  │
└──────────────────────────────────────┘
```

### Slider Logic

| Slider                           | What it controls                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Microphone, Game, Music, ...** | Each named channel the streamer opens (up to 8)                                                                           |
| **📺 Broadcast (residual)**      | Whatever remains in the main broadcast after cancellation — keep this low; setting it to 0 silences unknown leftovers too |
| **🎧 Your Music**                | Spotify embed (optional, below)                                                                                           |

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

## When the Streamer Doesn't Have the Plugin

The channel list comes back empty. You just get the classic single mute button — same as before extension installation.

## Adding Your Own Music

1. In the mixer panel, click "Connect Spotify" under the **🎧 Your Music** section.
2. Sign in with your Spotify account (Premium required — Spotify Web Playback SDK restriction).
3. Search for a playlist or track and hit play.
4. Use the "Your Music" slider to adjust volume.

> YouTube Music, Apple Music, etc. are planned for later.

## Fine Tuning

**Cancellation isn't perfectly clean** — if a sound is still faintly audible:

1. Mixer panel → ⚙ Settings
2. Drag the **Manual Offset** slider within ±200 ms
3. Stop at the cleanest point (auto-tune usually finds it)

**Only keep specific tracks active** (bandwidth saving):

- Mark tracks you constantly disable as "Permanently Off" → that track is never pulled from the relay.

## Privacy

- No viewer data is sent to a server.
- Your Spotify session lives in your browser only.
- All settings are in `chrome.storage.local` — fully local.

## Troubleshooting

**Mixer icon doesn't appear**

- Refresh the page (F5)
- Make sure the extension has permission on this page (puzzle icon → permissions)

**Channel list is empty ("Streamer's plugin not running")**

- The streamer hasn't installed the plugin. Without it the extension can only offer a classic mute.

**Some channels show up but certain sounds still come from the main broadcast**

- The streamer may not have separated every audio source (e.g. notifications not on their own channel)
- The "📺 Broadcast (residual)" slider controls those leftovers

**Audio stutters**

- Mixer → ⚙ Settings → bump "Buffer" from 200 → 500 ms.
