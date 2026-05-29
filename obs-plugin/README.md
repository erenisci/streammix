# obs-plugin

OBS Studio plugin — packages the streamer experience inside OBS. **Deferred to v0.2.** For the v0.1 MVP the standalone Windows CLI ([../publisher/](../publisher/)) covers the streamer side.

**Language:** C++20
**Build:** CMake 3.28+
**Dependencies:**
- The shared codec ([../shared/cpp/](../shared/cpp/)) — no external deps
- For the libobs module target: OBS Studio dev kit + Qt6 + libopus + libwebsockets

## Build (host-side only, no OBS)

The wire-format codec used by this directory lives in `shared/cpp/`; build and test it there:

```bash
cd ../shared/cpp
cmake -S . -B build
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

The OBS-plugin scaffold (dock + channel model) also builds host-only:

```bash
cd obs-plugin
cmake -S . -B build -DSTREAMMIX_BUILD_PLUGIN=OFF
cmake --build build --config Release
```

## Build (full plugin)

Requires the OBS dev kit and Qt6.

```bash
cmake -S . -B build -DSTREAMMIX_BUILD_PLUGIN=ON
cmake --build build --config Release
```

Install to OBS's plugin directory; see [../docs/STREAMER_SETUP.md](../docs/STREAMER_SETUP.md) for end-user packaging.

## Source Layout

| Path | Purpose |
|---|---|
| `src/plugin/` | libobs module entry point + Qt dock UI |

The wire-format codec used here is reused from [../shared/cpp/](../shared/cpp/) (`streammix_proto` static library).

Protocol reference: [../docs/AUDIO_PROTOCOL.md](../docs/AUDIO_PROTOCOL.md)
Streamer setup: [../docs/STREAMER_SETUP.md](../docs/STREAMER_SETUP.md)

## Status

v0.2 target:
- ✅ Channel model (Qt) + dock registration scaffold
- ✅ Reuses the proto codec from `shared/cpp/` (12 host-side tests passing)
- ⏳ Audio capture from OBS audio sources, Opus encoding, WebSocket publisher — to be ported from `publisher/src/`
