# extension

Browser extension — adds a multi-channel mixer to Twitch and Kick players, using the streamer's clean side-channels to cancel the corresponding audio out of the main broadcast.

**Languages:** TypeScript + Svelte (mixer UI)
**Manifest:** V3
**Targets:** Chromium-based browsers + Firefox

## Build & Run

```bash
cd extension
pnpm install                # or: npm install
pnpm dev                    # vite watch build into dist/
```

Then load `dist/` as an unpacked extension:

- **Chrome / Edge / Brave:** `chrome://extensions` → "Load unpacked" → pick `extension/dist`
- **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → pick `extension/dist/manifest.json`

To package for Firefox AMO submission:

```bash
pnpm build
pnpm package:firefox
```

## Status

Code-complete for the v0.1 viewer experience. Each incoming AUDIO_OPUS frame is decoded via WebCodecs `AudioDecoder`, scheduled onto a per-track playback chain, and routed into both the user-mix gain and an inverted-and-delayed cancellation lane that subtracts the side-channel out of the broadcast. Moving a slider down audibly silences the corresponding streamer-side source.

Settings panel (gear icon) exposes a manual sync-offset slider (0–2000 ms). Automatic fingerprint-based offset is a Phase 5b follow-up.

Build:

```bash
cd extension
npm install
npm run build       # vite build → extension/dist
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked) or Firefox (`about:debugging` → Load Temporary Add-on).

## Usage

[../docs/VIEWER_SETUP.md](../docs/VIEWER_SETUP.md)
