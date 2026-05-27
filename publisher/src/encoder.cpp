#include "encoder.h"

#include <opus.h>

#include <cstdio>
#include <string>

namespace streammix::publisher {

struct OpusEncoder::Impl {
    ::OpusEncoder* enc = nullptr;
    ~Impl() { if (enc) opus_encoder_destroy(enc); }
};

std::unique_ptr<OpusEncoder> OpusEncoder::Create(int bitrate_kbps, std::string& err) {
    int error = 0;
    auto* raw = opus_encoder_create(kSampleRate, kChannels, OPUS_APPLICATION_AUDIO, &error);
    if (error != OPUS_OK || !raw) {
        err = std::string{"opus_encoder_create: "} + opus_strerror(error);
        return nullptr;
    }

    auto self = std::unique_ptr<OpusEncoder>(new OpusEncoder());
    self->impl_ = std::make_unique<Impl>();
    self->impl_->enc = raw;

    opus_encoder_ctl(raw, OPUS_SET_BITRATE(bitrate_kbps * 1000));
    opus_encoder_ctl(raw, OPUS_SET_VBR(1));
    opus_encoder_ctl(raw, OPUS_SET_SIGNAL(OPUS_SIGNAL_MUSIC));
    opus_encoder_ctl(raw, OPUS_SET_COMPLEXITY(8));

    return self;
}

OpusEncoder::~OpusEncoder() = default;

std::vector<std::uint8_t> OpusEncoder::Encode(const float* samples, std::size_t sample_count) {
    // sample_count is total interleaved samples; must be channels * kFrameSamples.
    if (sample_count != static_cast<std::size_t>(kFrameSamples) * kChannels) {
        return {};
    }
    std::vector<std::uint8_t> out(4000);  // worst-case Opus packet size
    int written = opus_encode_float(impl_->enc, samples, kFrameSamples,
                                    out.data(), static_cast<opus_int32>(out.size()));
    if (written < 0) {
        std::fprintf(stderr, "[encoder] opus_encode_float failed: %d (%s)\n",
                     written, opus_strerror(written));
        return {};
    }
    out.resize(static_cast<std::size_t>(written));
    return out;
}

}  // namespace streammix::publisher
