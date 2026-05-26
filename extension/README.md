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

Phase 3 skeleton. Renders the mixer panel on Twitch and Kick channel pages, subscribes to the relay, applies viewer preferences (global + per-streamer) to sliders. Cancellation summing and Opus decoding are deferred to Phase 5.

## Usage

[../docs/VIEWER_SETUP.md](../docs/VIEWER_SETUP.md)
