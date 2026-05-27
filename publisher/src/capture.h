#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <thread>

namespace streammix::publisher {

// PCM frame delivered from the capture thread to the encoder.
//   samples: interleaved 32-bit float, channels first (e.g. L0,R0,L1,R1,...)
//   sample_rate: typically 48000 (matches Opus and OBS conventions)
//   channels: 1 or 2
//   timestamp_100ns: Windows performance counter (100 ns ticks) when captured
struct PcmFrame {
    std::vector<float> samples;
    std::uint32_t sample_rate;
    std::uint16_t channels;
    std::uint64_t timestamp_100ns;
};

using PcmCallback = std::function<void(PcmFrame&&)>;

// Capture target: either a specific process by exe name or the system loopback.
struct CaptureTarget {
    // "Spotify.exe" — case-insensitive. Empty + use_system=true → system mix.
    std::string process_exe;
    bool use_system = false;
};

// Windows WASAPI process-loopback capture. Runs in its own thread; delivers
// PcmFrame batches to the callback at ~10ms intervals (WASAPI default).
class ProcessLoopbackCapture {
public:
    ProcessLoopbackCapture();
    ~ProcessLoopbackCapture();

    ProcessLoopbackCapture(const ProcessLoopbackCapture&) = delete;
    ProcessLoopbackCapture& operator=(const ProcessLoopbackCapture&) = delete;

    // Start capture. Returns empty string on success, or an error description.
    std::string Start(const CaptureTarget& target, PcmCallback cb);

    // Stop and join the capture thread.
    void Stop();

    // True from Start() until Stop() or capture-thread error.
    bool Running() const { return running_.load(); }

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    std::atomic<bool> running_{false};
    std::thread thread_;
};

}  // namespace streammix::publisher
