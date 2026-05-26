# Contributing

StreamMix is open source and accepts contributions. This document summarizes the development process.

## Development Environment

| Component     | Required tools                        |
| ------------- | ------------------------------------- |
| `relay/`      | Go 1.22+                              |
| `extension/`  | Node.js 20+, pnpm                     |
| `obs-plugin/` | CMake 3.28+, C++17, OBS Studio source |
| `shared/`     | none (schema files only)              |

## First-time Setup

```bash
git clone https://github.com/<org>/streammix.git
cd streammix

# Relay
cd relay && go mod download && cd ..

# Extension
cd extension && pnpm install && cd ..

# OBS Plugin — see obs-plugin/README.md (platform-specific)
```

## Local Test Flow

1. Run the relay: `cd relay && go run ./cmd/relay --config dev.yaml`
2. Load the extension in dev mode: `cd extension && pnpm dev` → in Chrome go to `chrome://extensions` → "Load unpacked" → `extension/dist`
3. Build and run the OBS plugin with a debug build of OBS
4. In the OBS dock set `Relay URL`: `ws://localhost:8080`, `Channel`: `twitch:test`
5. Open `https://twitch.tv/test` in the browser (the player will be empty since there's no real channel, but the extension still loads — use `tools/test-player.html` for a test player)

## Coding Standards

- **Go:** `gofmt`, `golangci-lint run`
- **TypeScript:** `eslint`, `prettier` — config in the repo
- **C++:** `clang-format` — `.clang-format` in the repo

## Commit Messages

Conventional Commits:

```
feat(extension): add shortcut for mixer slider
fix(relay): channel name was not normalized
docs(architecture): add cancellation pipeline diagram
```

## PR Process

1. Open an issue or comment on an existing one
2. Feature branch (`feat/...`, `fix/...`)
3. At least 1 review approval + green CI

## Code of Conduct

Be respectful and constructive. Toxicity, personal attacks, and harassment are not tolerated. The maintainer team will warn and, if necessary, ban.
