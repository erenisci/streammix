# Channel Categories (Preset List)

Streamers choose from this list when adding a channel in the OBS plugin. Categories on this list participate in the **global preference scope** — once a viewer sets a value it applies across every streamer.

A streamer who wants a channel that isn't on the list picks "Custom" and enters free text. Custom channels are remembered **only per that streamer**.

## Standard Categories

| Slug (key)      | English         | Typical use                      |
| --------------- | --------------- | -------------------------------- |
| `mic`           | Microphone      | The streamer's own voice         |
| `game`          | Game            | Game SFX and music               |
| `music`         | Music           | Spotify, playlist, BGM           |
| `voicechat`     | Voice Chat      | Discord, in-game voice           |
| `notifications` | Notifications   | OS / app notification sounds     |
| `browser`       | Browser         | Browser tabs, embedded videos    |
| `alerts`        | Stream Alerts   | Streamlabs, StreamElements, etc. |
| `tts`           | TTS / Donations | Text-to-speech, donation reader  |

> Note: slugs are **lowercase ASCII kebab-case**. The slug is used as the track identifier in the WebSocket protocol and as the preference key on the viewer side.

## Custom Channel

- Streamer enters a free-form label (e.g. "Co-host Mic")
- The system derives a slug automatically: `co-host-mic`
- If the slug collides, `-2`, `-3`, ... is appended
- Per-streamer scope only; never enters the global preference store

## Proposing a New Standard Category

If a use-case is common enough, open a GitHub Issue with the "category proposal" label. Accepted proposals are added to this list and shipped in a **new minor release**. They remain as custom slugs on older releases.

## Versioning

- The standard list does **not** need to match between extension and plugin versions
- If the plugin publishes a category newer than the extension knows about, the extension shows it as custom (slug unchanged, display name falls back to the slug)
