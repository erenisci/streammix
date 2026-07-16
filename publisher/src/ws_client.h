#pragma once

#include <atomic>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace streammix::publisher {

// libwebsockets client. Maintains a connection to the relay's /publish endpoint
// and a thread-safe outbound queue, reconnecting automatically with backoff.
//
// Lifetime: construct → SetOnConnected(...) → Start(...) → Enqueue() any number
// of times → Stop().
//
// Enqueue() is non-blocking; if the queue fills past kMaxQueue packets the OLDEST
// entry is dropped (matches the relay's slow-subscriber semantics).
//
// Reconnect: if the relay drops the connection, the service thread retries with
// exponential backoff until Stop(). Because the relay treats each connection as a
// fresh publisher, the session must be re-announced on every (re)connect — that
// is what the OnConnected callback is for: it fires on each successful handshake
// and is expected to enqueue HELLO + TRACK_LIST. The queue is cleared just before
// it fires, so those frames always lead and stale audio from the outage is
// dropped rather than delivered late.
class WebSocketClient {
public:
    WebSocketClient();
    ~WebSocketClient();

    WebSocketClient(const WebSocketClient&) = delete;
    WebSocketClient& operator=(const WebSocketClient&) = delete;

    // Fires on the service thread after every successful handshake. Set before
    // Start(). Must enqueue whatever the relay needs to re-establish session
    // state (HELLO + TRACK_LIST).
    void SetOnConnected(std::function<void()> cb) { on_connected_ = std::move(cb); }

    // url:    "ws://host:port" or "wss://host:port"
    // path:   "/publish?channel=...&token=..."
    // Returns empty once the connection attempt is under way, or an error string
    // if the URL or the lws context is unusable. A relay that is merely down is
    // not an error — the client keeps retrying.
    std::string Start(const std::string& url, const std::string& path);

    void Stop();

    void Enqueue(std::vector<std::uint8_t> packet);

    // True only between a completed handshake and the connection dropping.
    bool Connected() const { return connected_.load(); }
    std::uint64_t QueueDepth() const;
    std::uint64_t Dropped() const { return dropped_.load(); }
    std::uint64_t SentPackets() const { return sent_.load(); }
    std::uint64_t Reconnects() const { return reconnects_.load(); }

    // Accessors used by the libwebsockets C callback. Treat as internal API.
    std::mutex& Mutex() { return queue_mu_; }
    std::deque<std::vector<std::uint8_t>>& Queue() { return queue_; }
    void OnEstablished();
    void MarkDisconnected();
    void OnPacketSent() { sent_.fetch_add(1); }
    void* WsiPtr();  // opaque, cast to lws* inside ws_client.cpp

private:
    bool TryConnect();

    struct Impl;
    std::unique_ptr<Impl> impl_;

    std::function<void()> on_connected_;

    mutable std::mutex queue_mu_;
    std::deque<std::vector<std::uint8_t>> queue_;
    static constexpr std::size_t kMaxQueue = 256;
    std::atomic<std::uint64_t> dropped_{0};
    std::atomic<std::uint64_t> sent_{0};
    std::atomic<std::uint64_t> reconnects_{0};
    std::atomic<bool> connected_{false};
    std::atomic<bool> connecting_{false};
    std::atomic<bool> stop_requested_{false};
    std::thread thread_;
    // While disconnected there is no socket left to generate events, and
    // lws_service ignores its timeout argument on lws 4.x — so the service loop
    // would sleep indefinitely and never re-evaluate the reconnect backoff. This
    // thread pokes it awake. (Enqueue's lws_cancel_service masks the problem
    // whenever audio happens to be flowing; a silent source must reconnect too.)
    std::thread watchdog_;
};

}  // namespace streammix::publisher
