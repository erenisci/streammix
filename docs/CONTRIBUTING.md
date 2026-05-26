# Contributing

StreamMix is open source and accepts contributions. This document summarizes the development process.

## Development Environment

| Component     | Required tools                                              |
| ------------- | ----------------------------------------------------------- |
| `relay/`      | Go 1.22+                                                    |
| `extension/`  | Node.js 20+, pnpm (or npm)                                  |
| `obs-plugin/` | CMake 3.28+, C++20 compiler, OBS Studio dev kit (for the libobs target) |
| `shared/`     | Node.js 20+ for `shared/ts/`, Go 1.22+ for `shared/go/`     |

## First-time Setup

```bash
git clone https://github.com/<org>/streammix.git
cd streammix

# Shared (TypeScript half — the Go half has no install step)
cd shared/ts && npm install && cd ../..

# Relay
cd relay && go mod download && cd ..

# Extension
cd extension && npm install && cd ..

# OBS Plugin — see obs-plugin/README.md (platform-specific)
```

## Running Tests

```bash
# Shared codec (TypeScript)
cd shared/ts && node --import tsx --test test/*.test.ts

# Shared codec (Go) + relay
cd shared/go && go test ./...
cd relay && go test ./...

# OBS plugin proto codec (host-only build; no OBS dev kit needed)
cd obs-plugin && cmake -S . -B build -DSTREAMMIX_BUILD_PLUGIN=OFF
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

## Local End-to-End Smoke Test

Without OBS or the browser extension you can validate the relay using the mock CLIs under `tools/`:

```bash
# 1. Start the relay
cd relay && go build ./cmd/relay
./relay secret > /tmp/secret      # paste the value into config.yaml's auth.token_secret
./relay --config config.yaml

# 2. Mint a publisher token (in a second terminal)
TOKEN=$(./relay token --channel twitch:dev --ttl 1h --config config.yaml)

# 3. Run the mock publisher
cd ../tools/mock-publisher && npm install
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev --token "$TOKEN"

# 4. Run the mock subscriber (in a third terminal)
cd ../mock-subscriber && npm install
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev
```

The subscriber should print a steadily growing `counts` map (AudioOpus dominating).

## Browser Extension Dev Loop

1. Load the extension in dev mode: `cd extension && npm run dev`
2. Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → `extension/dist`
3. Firefox: `about:debugging` → "This Firefox" → "Load Temporary Add-on" → `extension/dist/manifest.json`

## Coding Standards

- **Go:** `gofmt`, `golangci-lint run`
- **TypeScript:** strict mode, `noUncheckedIndexedAccess` on; format with prettier
- **C++:** C++20, MSVC `/W4 /WX`, GCC/Clang `-Wall -Wextra -Wpedantic -Werror`

## Security Posture

A few rules every change has to respect — these are load-bearing for the project's threat model:

- **The relay is opaque.** It MUST NOT parse payloads. It checks the 4-byte magic for sanity, then forwards bytes verbatim.
- **Bounded everywhere.** Every decoder validates length before reading; every server endpoint sets `SetReadLimit`; every collection has a documented cap.
- **Constant-time auth comparisons.** Use `crypto/hmac.Equal` in Go; no `==` on secrets.
- **Strict JSON.** No reflection-based unmarshaling of attacker-supplied bytes. In Go, use `DisallowUnknownFields` and `dec.More()` to reject trailing data. In TS, read named fields with explicit type/length checks.
- **Forward-compatible additions only.** Unknown message types and unknown preset categories are dropped or treated as custom; do not repurpose values without a `streammix.v2` subprotocol bump.

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
