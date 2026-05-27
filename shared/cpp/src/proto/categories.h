#pragma once

#include <array>
#include <string_view>

namespace streammix::proto {

inline constexpr std::string_view kCustomCategory = "custom";

// Preset slugs mirror docs/CHANNEL_CATEGORIES.md.
inline constexpr std::array<std::string_view, 8> kPresetCategories = {
    "mic",
    "game",
    "music",
    "voicechat",
    "notifications",
    "browser",
    "alerts",
    "tts",
};

bool IsPresetCategory(std::string_view s);

// 1..64 chars, lowercase ASCII, [a-z0-9-], no leading/trailing dash, no double dash.
bool IsValidSlug(std::string_view s);

}  // namespace streammix::proto
