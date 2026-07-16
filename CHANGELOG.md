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
