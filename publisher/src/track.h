#pragma once

#include <cstdint>
#include <string>

namespace streammix::publisher {

// Track configuration parsed from the CLI. One entry per --track flag.
//
// Example: --track music:Spotify.exe   → category="music", process="Spotify.exe"
struct TrackSpec {
    std::uint8_t id;        // 1..8, assigned in CLI order
    std::string category;   // preset slug ("mic", "music", ...) or "custom"
    std::string slug;       // normalised id used on the wire
    std::string label;      // viewer-facing display name
    std::string process;    // exe name (e.g. "Spotify.exe") OR "system" for full mix
};

}  // namespace streammix::publisher
