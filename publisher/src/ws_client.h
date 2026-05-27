#pragma once

#include <atomic>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace streammix::publisher {

// libwebsockets client. Handles a single connection to the relay's /publish
// endpoint and a thread-safe outbound queue.
//
// Lifetime: construct → Start(...) → Enqueue() any number of times → Stop().
// Enqueue() is non-blocking; if the queue fills past `max_queue` packets the
// OLDEST entry is dropped (matches the relay's slow-subscriber semantics).
class WebSocketClient {
public:
    WebSocketClient();
    ~WebSocketClient();

    WebSocketClient(const WebSocketClient&) = delete;
    WebSocketClient& operator=(const WebSocketClient&) = delete;

    // url:    "ws://host:port" or "wss://host:port"
    // path:   "/publish?channel=...&token=..."
    // Returns empty on success, or an error string.
    std::string Start(const std::string& url, const std::string& path);

    void Stop();

    void Enqueue(std::vector<std::uint8_t> packet);

    bool Connected() const { return connected_.load(); }
    std::uint64_t QueueDepth() const;
    std::uint64_t Dropped() const { return dropped_.load(); }
    std::uint64_t SentPackets() const { return sent_.load(); }

    // Accessors used by the libwebsockets C callback. Treat as internal API.
    std::mutex& Mutex() { return queue_mu_; }
    std::deque<std::vector<std::uint8_t>>& Queue() { return queue_; }
    void MarkDisconnected() { connected_.store(false); }
    void OnPacketSent() { sent_.fetch_add(1); }
    void* WsiPtr();  // opaque, cast to lws* inside ws_client.cpp

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;

    mutable std::mutex queue_mu_;
    std::deque<std::vector<std::uint8_t>> queue_;
    static constexpr std::size_t kMaxQueue = 256;
    std::atomic<std::uint64_t> dropped_{0};
    std::atomic<std::uint64_t> sent_{0};
    std::atomic<bool> connected_{false};
    std::atomic<bool> stop_requested_{false};
    std::thread thread_;
};

}  // namespace streammix::publisher
