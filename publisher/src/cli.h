#pragma once

#include <string>
#include <vector>
#include <variant>

#include "track.h"

namespace streammix::publisher {

struct Config {
    std::string relay_url;   // e.g. "ws://localhost:8080"
    std::string channel;     // e.g. "twitch:dev"
    std::string token;       // publisher token (HMAC)
    std::vector<TrackSpec> tracks;
    int bitrate_kbps = 48;   // Opus bitrate per track
};

struct CliError {
    std::string message;
};

std::variant<Config, CliError> ParseArgs(int argc, char** argv);

void PrintUsage(const char* program);

}  // namespace streammix::publisher
