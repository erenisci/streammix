#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "cli.h"
#include "capture.h"
#include "encoder.h"
#include "ws_client.h"

#include "proto/categories.h"
#include "proto/header.h"

using namespace streammix::publisher;
using streammix::proto::Frame;
using streammix::proto::MessageType;
using streammix::proto::EncodeFrame;
using streammix::proto::ProtocolError;
using streammix::proto::kHeaderBytes;

namespace {

std::atomic<bool> g_quit{false};

void HandleSigint(int) { g_quit.store(true); }

std::uint64_t NowMs() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

// Build the connection path: /publish?channel=<urlenc>&token=<urlenc>
std::string UrlEncode(const std::string& s) {
    static const char* hex = "0123456789ABCDEF";
    std::string out;
    out.reserve(s.size() * 3);
    for (unsigned char c : s) {
        bool unreserved = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                          (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' ||
                          c == ':';  // channel ids contain ':'
        if (unreserved) {
            out.push_back(static_cast<char>(c));
        } else {
            out.push_back('%');
            out.push_back(hex[c >> 4]);
            out.push_back(hex[c & 0xf]);
        }
    }
    return out;
}

std::vector<std::uint8_t> EncodeFrameOrLog(const Frame& f, const char* context) {
    auto r = EncodeFrame(f);
    if (auto* err = std::get_if<ProtocolError>(&r)) {
        std::fprintf(stderr, "[publisher] encode %s failed: %s\n", context, err->message.c_str());
        return {};
    }
    return std::get<std::vector<std::uint8_t>>(r);
}

// Build the HELLO JSON payload by hand (small, fixed shape).
std::vector<std::uint8_t> BuildHelloPayload() {
    static const char body[] =
        R"({"version":1,"client":"publisher/0.0.1","audio":{"codec":"opus","sample_rate":48000,"channels":2,"frame_ms":20}})";
    return {body, body + sizeof(body) - 1};
}

// Build the TRACK_LIST JSON for the configured tracks.
std::vector<std::uint8_t> BuildTrackListPayload(const Config& cfg) {
    std::string out = R"({"tracks":[)";
    for (std::size_t i = 0; i < cfg.tracks.size(); ++i) {
        const auto& t = cfg.tracks[i];
        if (i) out.push_back(',');
        out += R"({"id":)";
        out += std::to_string(t.id);
        out += R"(,"slug":")"; out += t.slug;
        out += R"(","category":")"; out += t.category;
        out += R"(","label":")"; out += t.label;
        out += R"("})";
    }
    out += "]}";
    return {out.begin(), out.end()};
}

}  // namespace

// Per-track encoder + sample buffer; one instance per --track.
struct TrackPipeline {
    TrackSpec spec;
    std::unique_ptr<OpusEncoder> encoder;
    std::unique_ptr<ProcessLoopbackCapture> capture;
    std::vector<float> buffer;  // accumulates samples until we have a full 20 ms frame
    std::uint32_t seq = 0;
    std::mutex mu;              // guards buffer + seq
};

int main(int argc, char** argv) {
    auto parsed = ParseArgs(argc, argv);
    if (auto* err = std::get_if<CliError>(&parsed)) {
        if (err->message != "help") std::fprintf(stderr, "%s\n", err->message.c_str());
        PrintUsage(argv[0]);
        return err->message == "help" ? 0 : 2;
    }
    Config cfg = std::get<Config>(parsed);

    std::signal(SIGINT, HandleSigint);

    // ---------------- WebSocket ----------------
    WebSocketClient ws;
    std::string path = "/publish?channel=" + UrlEncode(cfg.channel) +
                       "&token=" + UrlEncode(cfg.token);
    if (auto e = ws.Start(cfg.relay_url, path); !e.empty()) {
        std::fprintf(stderr, "[publisher] ws start failed: %s\n", e.c_str());
        return 1;
    }

    // Give the connection a brief moment to upgrade before we start sending.
    for (int i = 0; i < 50 && !ws.Connected(); ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    // (Connected() is set at construct time true until error — actual handshake
    // success is signalled by LWS_CALLBACK_CLIENT_ESTABLISHED which prints
    // "[ws] connected".)

    // ---------------- HELLO ----------------
    Frame hello;
    hello.type = MessageType::Hello;
    hello.track = streammix::proto::kControlTrack;
    hello.seq = 0;
    hello.timestamp_ms = NowMs();
    hello.payload = BuildHelloPayload();
    ws.Enqueue(EncodeFrameOrLog(hello, "HELLO"));

    // ---------------- TRACK_LIST ----------------
    Frame tl;
    tl.type = MessageType::TrackList;
    tl.track = streammix::proto::kControlTrack;
    tl.seq = 1;
    tl.timestamp_ms = NowMs();
    tl.payload = BuildTrackListPayload(cfg);
    ws.Enqueue(EncodeFrameOrLog(tl, "TRACK_LIST"));

    std::fprintf(stderr, "[publisher] sent HELLO + TRACK_LIST (%zu track%s)\n",
                 cfg.tracks.size(), cfg.tracks.size() == 1 ? "" : "s");

    // ---------------- Per-track pipelines ----------------
    std::vector<std::shared_ptr<TrackPipeline>> pipelines;
    for (const auto& t : cfg.tracks) {
        auto pipe = std::make_shared<TrackPipeline>();
        pipe->spec = t;

        std::string enc_err;
        pipe->encoder = OpusEncoder::Create(cfg.bitrate_kbps, enc_err);
        if (!pipe->encoder) {
            std::fprintf(stderr, "[publisher] encoder for %s: %s\n", t.slug.c_str(), enc_err.c_str());
            return 1;
        }
        pipe->capture = std::make_unique<ProcessLoopbackCapture>();

        CaptureTarget target;
        target.use_system = (t.process == "system");
        target.process_exe = target.use_system ? std::string{} : t.process;

        auto pipe_weak = std::weak_ptr<TrackPipeline>(pipe);
        auto track_id = t.id;
        auto err = pipe->capture->Start(target, [pipe_weak, track_id, &ws](PcmFrame&& frame) {
            auto p = pipe_weak.lock();
            if (!p) return;
            // Accumulate until we have at least one 20 ms (960 stereo) chunk; emit
            // as many frames as fit, keep the remainder for the next call.
            constexpr std::size_t kNeed =
                OpusEncoder::kFrameSamples * OpusEncoder::kChannels;

            std::lock_guard<std::mutex> lock(p->mu);
            p->buffer.insert(p->buffer.end(), frame.samples.begin(), frame.samples.end());

            while (p->buffer.size() >= kNeed) {
                auto encoded = p->encoder->Encode(p->buffer.data(), kNeed);
                p->buffer.erase(p->buffer.begin(), p->buffer.begin() + kNeed);
                if (encoded.empty()) continue;

                Frame audio;
                audio.type = MessageType::AudioOpus;
                audio.track = track_id;
                audio.seq = ++p->seq;
                audio.timestamp_ms = NowMs();
                audio.payload = std::move(encoded);
                auto bytes = EncodeFrameOrLog(audio, "AUDIO_OPUS");
                if (!bytes.empty()) ws.Enqueue(std::move(bytes));
            }
        });
        if (!err.empty()) {
            std::fprintf(stderr, "[publisher] capture start (%s): %s\n", t.slug.c_str(), err.c_str());
            return 1;
        }
        pipelines.push_back(pipe);
        std::fprintf(stderr, "[publisher] capturing %s ← %s\n",
                     t.slug.c_str(),
                     target.use_system ? "system" : t.process.c_str());
    }

    // ---------------- Periodic stats ----------------
    auto last_report = std::chrono::steady_clock::now();
    while (!g_quit.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        auto now = std::chrono::steady_clock::now();
        if (now - last_report >= std::chrono::seconds(5)) {
            std::fprintf(stderr,
                         "[publisher] sent=%llu queue=%llu dropped=%llu\n",
                         static_cast<unsigned long long>(ws.SentPackets()),
                         static_cast<unsigned long long>(ws.QueueDepth()),
                         static_cast<unsigned long long>(ws.Dropped()));
            last_report = now;
        }
    }

    std::fprintf(stderr, "[publisher] shutting down\n");
    for (auto& p : pipelines) {
        if (p->capture) p->capture->Stop();
    }
    ws.Stop();
    return 0;
}
