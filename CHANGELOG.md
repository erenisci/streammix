# Changelog

All notable changes to StreamMix are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from `v0.1.0`
onward.

## [Unreleased]

### Added

- **Continuous integration** — GitHub Actions workflow (`.github/workflows/ci.yml`)
  running a per-language matrix on every push and pull request: `shared/ts`
  (typecheck + tests), `shared/go` (vet + tests), `shared/cpp` (build + ctest),
  `relay` (vet + tests), and `extension` (typecheck + build).
- **`deploy/`** — turnkey always-on relay deploy: Docker Compose stack running the
  relay behind Caddy with automatic Let's Encrypt TLS, so the public endpoint is
  `wss://<domain>` as the extension requires. Runs free on an Oracle Cloud Always
  Free VM plus a DuckDNS subdomain. The HMAC secret is mounted at runtime and
  gitignored, never baked into the image.

### Fixed

- **Publisher-auth rate limiter could be bypassed behind a reverse proxy.** The
  relay identifies callers by the leftmost `X-Forwarded-For` entry, but Caddy
  appends to a client-supplied XFF by default, leaving that entry attacker-
  controlled. `deploy/Caddyfile` now overwrites XFF with the real peer address,
  and `docs/RELAY_SELFHOST.md` documents the nginx equivalent.
- **`--ttl 365d` in every token example was a parse error.** `--ttl` takes a Go
  duration whose largest unit is the hour; the docs now use `8760h`.
- **`docs/RELAY_SELFHOST.md` quick start could not work.** It configured the relay
  through `RELAY_*` environment variables, which it has never supported (YAML
  only), and pulled a container image that does not exist. It now points at
  `deploy/`.
- **`docs/RELAY_SELFHOST.md` config sample used `max_packet_bytes`**; the real
  field is `max_frame_bytes`.

### Notes

The MVP is code-complete through the viewer-side audio pipeline (Opus decode +
phase-cancellation summing + manual offset slider). Remaining pre-release work is
integration-driven — real-browser end-to-end testing on Twitch/Kick, relay load
testing, a hosted relay, and store submission packages — and is tracked
internally rather than in this file until it lands.

## Wire protocol

The wire format is versioned by subprotocol identifier, currently
`streammix.v1`. Any breaking change to the 21-byte header or the message schemas
requires a `streammix.v2` bump; forward-compatible additions (new message types,
new preset category slugs) do not. See `docs/AUDIO_PROTOCOL.md`.
