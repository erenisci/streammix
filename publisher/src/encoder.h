#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace streammix::publisher {

// Thin RAII wrapper over libopus. Configured for 48 kHz stereo, 20 ms frames —
// the same shape declared in our HELLO message.
class OpusEncoder {
public:
    static std::unique_ptr<OpusEncoder> Create(int bitrate_kbps, std::string& err);
    ~OpusEncoder();

    OpusEncoder(const OpusEncoder&) = delete;
    OpusEncoder& operator=(const OpusEncoder&) = delete;

    // Encode exactly 960 stereo samples (20 ms @ 48 kHz, interleaved) into an
    // Opus packet. Returns the encoded bytes; empty on failure.
    std::vector<std::uint8_t> Encode(const float* samples, std::size_t sample_count);

    static constexpr int kSampleRate = 48000;
    static constexpr int kChannels = 2;
    static constexpr int kFrameSamples = 960;  // 20 ms @ 48 kHz

private:
    OpusEncoder() = default;
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace streammix::publisher
