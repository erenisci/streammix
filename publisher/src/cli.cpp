#include "cli.h"

#include <cstdio>
#include <cstring>
#include <string_view>

#include "proto/categories.h"

namespace streammix::publisher {

namespace {

// "music:Spotify.exe" → {category="music", process="Spotify.exe"}
// "custom:My Mic|VirtualMic.exe" → {category="custom", label="My Mic", process="VirtualMic.exe"}
bool ParseTrackArg(std::string_view arg, TrackSpec& out) {
    auto colon = arg.find(':');
    if (colon == std::string_view::npos) return false;
    std::string category{arg.substr(0, colon)};
    std::string rest{arg.substr(colon + 1)};
    if (rest.empty()) return false;

    if (category != proto::kCustomCategory && !proto::IsPresetCategory(category)) {
        return false;
    }

    // Custom may carry a label: "custom:Label|Process.exe"
    std::string label;
    std::string process;
    if (category == proto::kCustomCategory) {
        auto pipe = rest.find('|');
        if (pipe == std::string::npos) return false;
        label = rest.substr(0, pipe);
        process = rest.substr(pipe + 1);
        if (label.empty() || process.empty()) return false;
    } else {
        process = rest;
        // Default label is the preset name title-cased — keep simple.
        label = category;
        if (!label.empty()) label[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(label[0])));
    }

    out.category = category;
    out.label = label;
    out.process = process;
    // Slug: for presets it equals the category; for custom we sluggify the label.
    if (category == proto::kCustomCategory) {
        std::string slug;
        slug.reserve(label.size());
        bool prev_dash = false;
        for (char c : label) {
            unsigned char uc = static_cast<unsigned char>(c);
            if ((uc >= 'a' && uc <= 'z') || (uc >= '0' && uc <= '9')) {
                slug.push_back(c);
                prev_dash = false;
            } else if (uc >= 'A' && uc <= 'Z') {
                slug.push_back(static_cast<char>(c + ('a' - 'A')));
                prev_dash = false;
            } else if (!prev_dash && !slug.empty()) {
                slug.push_back('-');
                prev_dash = true;
            }
        }
        while (!slug.empty() && slug.back() == '-') slug.pop_back();
        if (slug.empty() || !proto::IsValidSlug(slug)) return false;
        out.slug = std::move(slug);
    } else {
        out.slug = category;
    }
    return true;
}

}  // namespace

void PrintUsage(const char* program) {
    std::fprintf(stderr,
        "Usage: %s --relay <ws-url> --channel <id> --token <tok> --track <spec> [--track <spec> ...]\n"
        "\n"
        "  --relay   WebSocket URL of the relay (e.g. ws://localhost:8080)\n"
        "  --channel Channel id, e.g. twitch:streamer\n"
        "  --token   Publisher token from the relay CLI\n"
        "  --track   Track spec. One of:\n"
        "              <preset>:<exe>            preset = mic|game|music|voicechat|notifications|browser|alerts|tts\n"
        "              custom:<Label>|<exe>      custom track, free-form label\n"
        "              <preset>:system           captures the system loopback (full mix)\n"
        "  --bitrate Opus bitrate per track in kbps (default 48)\n"
        "\n"
        "Examples:\n"
        "  %s --relay ws://localhost:8080 --channel twitch:dev --token TOKEN \\\n"
        "      --track music:Spotify.exe --track game:notepad.exe\n",
        program, program);
}

std::variant<Config, CliError> ParseArgs(int argc, char** argv) {
    Config cfg;
    for (int i = 1; i < argc; ++i) {
        std::string_view flag = argv[i];
        auto next = [&](const char* name) -> const char* {
            if (i + 1 >= argc) return nullptr;
            return argv[++i];
        };
        if (flag == "--relay") {
            auto v = next("--relay"); if (!v) return CliError{"--relay needs a value"};
            cfg.relay_url = v;
        } else if (flag == "--channel") {
            auto v = next("--channel"); if (!v) return CliError{"--channel needs a value"};
            cfg.channel = v;
        } else if (flag == "--token") {
            auto v = next("--token"); if (!v) return CliError{"--token needs a value"};
            cfg.token = v;
        } else if (flag == "--bitrate") {
            auto v = next("--bitrate"); if (!v) return CliError{"--bitrate needs a value"};
            cfg.bitrate_kbps = std::atoi(v);
            if (cfg.bitrate_kbps < 16 || cfg.bitrate_kbps > 128) {
                return CliError{"--bitrate must be in [16, 128] kbps"};
            }
        } else if (flag == "--track") {
            auto v = next("--track"); if (!v) return CliError{"--track needs a value"};
            TrackSpec spec;
            if (!ParseTrackArg(v, spec)) {
                return CliError{std::string{"invalid --track spec: "} + v};
            }
            spec.id = static_cast<std::uint8_t>(cfg.tracks.size() + 1);
            cfg.tracks.push_back(std::move(spec));
        } else if (flag == "--help" || flag == "-h") {
            return CliError{"help"};
        } else {
            return CliError{std::string{"unknown flag: "} + std::string{flag}};
        }
    }

    if (cfg.relay_url.empty()) return CliError{"--relay is required"};
    if (cfg.channel.empty()) return CliError{"--channel is required"};
    if (cfg.token.empty()) return CliError{"--token is required"};
    if (cfg.tracks.empty()) return CliError{"at least one --track is required"};
    if (cfg.tracks.size() > 8) return CliError{"maximum 8 tracks (ADR-001)"};

    return cfg;
}

}  // namespace streammix::publisher
