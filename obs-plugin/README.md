# obs-plugin

OBS Studio plugin — publishes the streamer's named audio channels to a side-channel through the relay.

**Language:** C++20
**Build:** CMake 3.28+
**Dependencies:**
- `streammix_proto` (built in this directory; no external deps)
- For the libobs module target: OBS Studio dev kit + Qt6 + libopus + libwebsockets

## Build (host-side only, no OBS)

The wire-format codec and the channel model build standalone for unit testing:

```bash
cd obs-plugin
cmake -S . -B build -DSTREAMMIX_BUILD_PLUGIN=OFF
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
```

## Build (full plugin)

Requires the OBS dev kit on the local machine (see [the OBS plugin template](https://github.com/obsproject/obs-plugintemplate) for platform-specific setup) plus Qt6.

```bash
cmake -S . -B build -DSTREAMMIX_BUILD_PLUGIN=ON
cmake --build build --config Release
```

Install to OBS's plugin directory; see [../docs/STREAMER_SETUP.md](../docs/STREAMER_SETUP.md) for end-user packaging.

## Source Layout

| Path | Purpose |
|---|---|
| `src/proto/` | Wire-format codec (C++ mirror of `shared/ts` and `shared/go`) |
| `src/plugin/` | libobs module entry point + Qt dock UI |
| `test/` | Host-side unit tests for the proto codec |

Protocol reference: [../docs/AUDIO_PROTOCOL.md](../docs/AUDIO_PROTOCOL.md)
Streamer setup: [../docs/STREAMER_SETUP.md](../docs/STREAMER_SETUP.md)

## Status

Phase 4 skeleton:
- ✅ Proto codec + 12 host-side unit tests passing (built with MSVC C++20)
- ✅ Channel model (Qt) + dock registration scaffold
- ⏳ Audio capture from OBS audio sources, Opus encoding, WebSocket publisher — wired into CMake, full implementation deferred to Phase 5
