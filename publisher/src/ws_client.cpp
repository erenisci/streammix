#include "ws_client.h"

#include <libwebsockets.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <iterator>

namespace streammix::publisher {

struct WebSocketClient::Impl {
    lws_context* ctx = nullptr;
    lws* wsi = nullptr;
    std::string host;
    int port = 0;
    bool tls = false;
    std::string path;
};

WebSocketClient::WebSocketClient() : impl_(std::make_unique<Impl>()) {}

WebSocketClient::~WebSocketClient() { Stop(); }

std::uint64_t WebSocketClient::QueueDepth() const {
    std::lock_guard<std::mutex> lock(queue_mu_);
    return queue_.size();
}

namespace {

struct PerSessionData {};  // unused; lws requires the slot

int LwsCallback(struct lws* wsi, enum lws_callback_reasons reason,
                void* /*user*/, void* in, std::size_t /*len*/) {
    auto* ctx = lws_get_context(wsi);
    auto* self = static_cast<WebSocketClient*>(lws_context_user(ctx));
    if (!self) return 0;

    switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            std::fprintf(stderr, "[ws] connected\n");
            self->OnEstablished();
            lws_callback_on_writable(wsi);
            return 0;

        case LWS_CALLBACK_EVENT_WAIT_CANCELLED:
            // Capture thread enqueued work and woke us. Ask for writeable.
            if (auto* w = static_cast<lws*>(self->WsiPtr())) {
                lws_callback_on_writable(w);
            }
            return 0;

        case LWS_CALLBACK_CLIENT_WRITEABLE: {
            std::vector<std::uint8_t> packet;
            bool more = false;
            {
                std::lock_guard<std::mutex> lock(self->Mutex());
                if (self->Queue().empty()) return 0;
                packet = std::move(self->Queue().front());
                self->Queue().pop_front();
                more = !self->Queue().empty();
            }
            std::vector<unsigned char> buf(LWS_PRE + packet.size());
            std::memcpy(buf.data() + LWS_PRE, packet.data(), packet.size());
            int written = lws_write(wsi, buf.data() + LWS_PRE,
                                    packet.size(), LWS_WRITE_BINARY);
            if (written < 0) {
                std::fprintf(stderr, "[ws] lws_write failed\n");
                return -1;
            }
            self->OnPacketSent();
            if (more) lws_callback_on_writable(wsi);
            return 0;
        }

        case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
            std::fprintf(stderr, "[ws] connection error: %s\n",
                         in ? static_cast<const char*>(in) : "(unknown)");
            self->MarkDisconnected();
            return 0;

        case LWS_CALLBACK_CLIENT_CLOSED:
            std::fprintf(stderr, "[ws] closed\n");
            self->MarkDisconnected();
            return 0;

        default:
            return 0;
    }
}

lws_protocols kProtocols[] = {
    { "streammix.v1", LwsCallback, sizeof(PerSessionData), 0, 0, nullptr, 0 },
    LWS_PROTOCOL_LIST_TERM,
};

}  // namespace

void WebSocketClient::Enqueue(std::vector<std::uint8_t> packet) {
    {
        std::lock_guard<std::mutex> lock(queue_mu_);
        if (queue_.size() >= kMaxQueue) {
            queue_.pop_front();
            dropped_.fetch_add(1);
        }
        queue_.push_back(std::move(packet));
    }
    // lws_callback_on_writable is NOT thread-safe. Wake the service thread via
    // the one cross-thread-safe API (lws_cancel_service); the callback above
    // converts EVENT_WAIT_CANCELLED into a writeable request inline.
    if (impl_->ctx) {
        lws_cancel_service(impl_->ctx);
    }
}

void* WebSocketClient::WsiPtr() { return impl_->wsi; }

void WebSocketClient::OnEstablished() {
    connected_.store(true);
    connecting_.store(false);
    // Drop anything the capture threads queued while we were down: those frames
    // carry stale timestamps, and the relay needs HELLO + TRACK_LIST to lead.
    {
        std::lock_guard<std::mutex> lock(queue_mu_);
        queue_.clear();
    }
    if (on_connected_) on_connected_();
}

void WebSocketClient::MarkDisconnected() {
    // lws frees the wsi around these callbacks; keeping the pointer would leave
    // Enqueue's wake-up path calling lws_callback_on_writable on freed memory.
    impl_->wsi = nullptr;
    connecting_.store(false);
    if (connected_.exchange(false)) {
        reconnects_.fetch_add(1);
    }
}

bool WebSocketClient::TryConnect() {
    lws_client_connect_info ccinfo{};
    ccinfo.context = impl_->ctx;
    ccinfo.address = impl_->host.c_str();
    ccinfo.port = impl_->port;
    ccinfo.path = impl_->path.c_str();
    ccinfo.host = impl_->host.c_str();
    ccinfo.origin = impl_->host.c_str();
    ccinfo.protocol = "streammix.v1";
    if (impl_->tls) ccinfo.ssl_connection = LCCSCF_USE_SSL;

    connecting_.store(true);
    impl_->wsi = lws_client_connect_via_info(&ccinfo);
    if (!impl_->wsi) {
        connecting_.store(false);
        return false;
    }
    return true;
}

std::string WebSocketClient::Start(const std::string& url, const std::string& path) {
    if (url.rfind("wss://", 0) == 0) {
        impl_->tls = true;
        auto rest = url.substr(6);
        auto colon = rest.find(':');
        if (colon == std::string::npos) {
            impl_->host = rest;
            impl_->port = 443;
        } else {
            impl_->host = rest.substr(0, colon);
            impl_->port = std::stoi(rest.substr(colon + 1));
        }
    } else if (url.rfind("ws://", 0) == 0) {
        impl_->tls = false;
        auto rest = url.substr(5);
        auto colon = rest.find(':');
        if (colon == std::string::npos) {
            impl_->host = rest;
            impl_->port = 80;
        } else {
            impl_->host = rest.substr(0, colon);
            impl_->port = std::stoi(rest.substr(colon + 1));
        }
    } else {
        return "url must start with ws:// or wss://";
    }
    impl_->path = path;

    lws_context_creation_info info{};
    info.port = CONTEXT_PORT_NO_LISTEN;
    info.protocols = kProtocols;
    info.gid = -1;
    info.uid = -1;
    info.user = this;
    if (impl_->tls) {
        info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
    }

    impl_->ctx = lws_create_context(&info);
    if (!impl_->ctx) return "lws_create_context failed";

    TryConnect();  // a failure here is not fatal; the loop below retries

    thread_ = std::thread([this]() {
        // Mirrors the extension's subscriber backoff (relay/client.ts).
        static constexpr int kBackoffMs[] = {500, 1000, 2000, 5000, 15000};
        constexpr int kBackoffCount = static_cast<int>(std::size(kBackoffMs));
        int attempt = 0;
        auto next_attempt = std::chrono::steady_clock::now();

        while (!stop_requested_.load()) {
            lws_service(impl_->ctx, 50);
            if (stop_requested_.load()) break;

            if (connected_.load()) {
                attempt = 0;
                continue;
            }
            if (connecting_.load()) continue;  // handshake in flight

            auto now = std::chrono::steady_clock::now();
            if (now < next_attempt) continue;

            std::fprintf(stderr, "[ws] reconnecting (attempt %d)\n", attempt + 1);
            TryConnect();
            next_attempt = now + std::chrono::milliseconds(
                                     kBackoffMs[std::min(attempt, kBackoffCount - 1)]);
            ++attempt;
        }
    });

    watchdog_ = std::thread([this]() {
        while (!stop_requested_.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
            if (!connected_.load() && impl_->ctx) {
                lws_cancel_service(impl_->ctx);  // the only thread-safe lws call
            }
        }
    });

    return {};
}

void WebSocketClient::Stop() {
    stop_requested_.store(true);
    if (impl_->ctx) lws_cancel_service(impl_->ctx);  // unblock a sleeping service loop
    if (watchdog_.joinable()) watchdog_.join();
    if (thread_.joinable()) thread_.join();
    if (impl_->ctx) {
        lws_context_destroy(impl_->ctx);
        impl_->ctx = nullptr;
    }
    connected_.store(false);
}

}  // namespace streammix::publisher
