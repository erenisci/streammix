# Streamer Setup

> Installing this plugin lets **viewers who have the extension** independently control the audio sources in your stream (mic, game, music, notifications, ...). For viewers without the extension, nothing about your broadcast changes.

## Requirements

- OBS Studio 30.0 or newer
- Windows 10/11, macOS 12+, or Linux (Ubuntu 22.04+)
- A separate audio source per component in your stream (mic, game audio, Spotify, ...)

## Installation

### 1. Download the plugin

> **Not yet released.**

After downloading:

- **Windows:** extract the `.zip` over `C:\Program Files\obs-studio\`
- **macOS:** run the `.pkg`
- **Linux:** install the `.deb` or `.rpm`

### 2. Open OBS and show the plugin dock

`View → Docks → StreamMix`

### 3. Connect to a relay

At the top of the dock:

- **Relay URL:** Leave empty to use `wss://relay.streammix.dev`
- **Channel:** Auto-filled to `twitch:<your_username>` or `kick:<your_username>`
- **Token:** Streamer token obtained from the website

To host your own relay: [RELAY_SELFHOST.md](RELAY_SELFHOST.md)

### 4. Add Channels

In the plugin dock, click **"Add Channel"**. Each channel asks for:

- **Category:** pick from the dropdown (Mic / Game / Music / Voice Chat / Notifications / Browser / Stream Alerts / TTS / **Custom**)
- **Label:** the name shown to viewers (auto-filled, editable)
- **Audio Source:** the matching OBS audio source

> **Important:** Each channel must be **only** the component it represents. If you pick a mixed source, cancellation breaks and the viewer's sliders won't respond correctly.

Maximum **8 channels**. Recommended: 3–5.

### Typical Setup Examples

**Minimal (3 channels):**

| Category | OBS Source                            | Why              |
| -------- | ------------------------------------- | ---------------- |
| `mic`    | "Mic/Aux"                             | Your voice       |
| `game`   | "Desktop Audio" (game origin)         | Game audio       |
| `music`  | "Spotify" (Application Audio Capture) | Background music |

**Full (5 channels):**

| Category    | OBS Source                          |
| ----------- | ----------------------------------- |
| `mic`       | Mic/Aux                             |
| `game`      | Application Audio Capture: game.exe |
| `music`     | Application Audio Capture: Spotify  |
| `voicechat` | Application Audio Capture: Discord  |
| `alerts`    | Browser Source: Streamlabs          |

### 5. OBS Routing — Dual Output

Every audio source must go to two places:

1. **Normal broadcast** (Track 1 — RTMP) → "extension-less" viewer experience
2. **Plugin** → side-channel

OBS does not do this automatically; you do:

1. OBS → `File → Settings → Audio → Advanced Audio Properties`
2. Each source must keep "Track 1" checked (goes to broadcast)
3. The plugin handles its own capture (via OBS audio callback API) — no extra config needed

A small indicator sits next to each channel in the plugin dock:

- 🟢 OK — capture active, packets flowing
- 🟡 Silent — source selected but no audio for 5s
- 🔴 Error — capture failed

### 6. Connect and Test

Hit **"Connect"** at the top of the dock. The status should turn green: "Connected".

## Verification

1. Start your stream
2. On a different device, open your channel in an extension-enabled browser
3. Click the mixer icon next to the player — confirm the channel list arrives
4. Drop a channel slider to 0 → that audio should drop (~15-20 dB), others continue
5. "Solo" a channel → only that one should be audible

## Troubleshooting

**Shows "Connected" but the viewer side doesn't see the channel list**

- Make sure you added at least one channel
- Channel name must match exactly, lowercase

**Cancellation is poor, music still audible**

- Verify the source for that channel has no extra effects (reverb, EQ)
- Disable any OBS monitor delay (`Audio → Advanced Audio Properties → Sync Offset = 0`)
- Check the "Sync Status" panel in the plugin dock — if fingerprint match score is below 80%, the source isn't clean

**The plugin slows down OBS**

- Reduce the number of channels
- Lower Opus bitrate: dock → `Advanced → Bitrate` → `32 kbps`

**Broadcast smoothness is degraded**

- The plugin does not affect the broadcast — only adds extra upload via the side-channel
- If your upload bandwidth is the bottleneck: reduce channels or lower the bitrate

## Performance

| Setup      | CPU   | RAM    | Upload bandwidth |
| ---------- | ----- | ------ | ---------------- |
| 1 channel  | 1–2%  | ~25 MB | ~52 kbps         |
| 3 channels | 2–4%  | ~40 MB | ~156 kbps        |
| 5 channels | 3–6%  | ~60 MB | ~260 kbps        |
| 8 channels | 5–10% | ~90 MB | ~416 kbps        |
