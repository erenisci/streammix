package internal

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	wire "github.com/streammix/streammix/shared/go"
)

// Server bundles the registry, config, and metrics state.
type Server struct {
	Cfg      *Config
	Reg      *Registry
	Secret   []byte
	Logger   *slog.Logger
	StartedAt time.Time

	// Metrics — atomics so the metrics endpoint reads without locking.
	packetsRelayed atomic.Uint64
	bytesRelayed   atomic.Uint64
	authFailures   atomic.Uint64
}

// New constructs a Server. secret is the HMAC token secret bytes.
func New(cfg *Config, reg *Registry, secret []byte, logger *slog.Logger) *Server {
	return &Server{
		Cfg:       cfg,
		Reg:       reg,
		Secret:    secret,
		Logger:    logger,
		StartedAt: time.Now(),
	}
}

// Routes registers all HTTP handlers.
func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("/publish", s.handlePublish)
	mux.HandleFunc("/subscribe", s.handleSubscribe)
	mux.HandleFunc("/health", s.handleHealth)
}

// handleHealth is a tiny readiness probe. No auth.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

// acceptOptions configures the websocket accept. We restrict subprotocol to
// streammix.v1; anything else is rejected at handshake time.
func acceptOptions() *websocket.AcceptOptions {
	return &websocket.AcceptOptions{
		Subprotocols: []string{wire.Subprotocol},
		// We accept any origin: the subscriber endpoint is public on purpose,
		// and the publisher endpoint is gated by the bearer token, not Origin.
		InsecureSkipVerify: true,
	}
}

// handlePublish accepts a single authenticated publisher per channel.
func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel")
	token := r.URL.Query().Get("token")

	if err := ValidateChannelID(channelID); err != nil {
		http.Error(w, "bad channel id", http.StatusBadRequest)
		return
	}
	if err := VerifyToken(s.Secret, channelID, token); err != nil {
		s.authFailures.Add(1)
		// Generic 401 — don't leak which step failed.
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}

	ch, err := s.Reg.GetOrCreate(channelID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	if err := ch.ClaimPublisher(); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	defer ch.ReleasePublisher()

	conn, err := websocket.Accept(w, r, acceptOptions())
	if err != nil {
		s.Logger.Warn("publish accept failed", "err", err, "channel", channelID)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "publisher closed")

	if conn.Subprotocol() != wire.Subprotocol {
		_ = conn.Close(websocket.StatusPolicyViolation, "subprotocol mismatch")
		return
	}

	conn.SetReadLimit(int64(s.Cfg.Limits.MaxFrameBytes))
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	s.Logger.Info("publisher connected", "channel", channelID)
	defer s.Logger.Info("publisher disconnected", "channel", channelID)

	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				s.Logger.Debug("publisher read end", "err", err)
			}
			return
		}
		if typ != websocket.MessageBinary {
			_ = conn.Close(websocket.StatusUnsupportedData, "binary only")
			return
		}
		// Cheap sanity check: every relay packet must start with MAGIC.
		// This is the ONLY interpretation the relay does — and it's just
		// a header sniff, not a full parse. We do not validate TYPE/TRACK/
		// payload; that's the receiver's job.
		if len(data) < 4 || data[0] != wire.Magic[0] || data[1] != wire.Magic[1] ||
			data[2] != wire.Magic[2] || data[3] != wire.Magic[3] {
			_ = conn.Close(websocket.StatusPolicyViolation, "bad magic")
			return
		}
		ch.Broadcast(data)
		s.packetsRelayed.Add(1)
		s.bytesRelayed.Add(uint64(len(data)))
	}
}

// handleSubscribe joins any caller to the channel's fan-out. No auth.
func (s *Server) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel")
	if err := ValidateChannelID(channelID); err != nil {
		http.Error(w, "bad channel id", http.StatusBadRequest)
		return
	}

	ch, err := s.Reg.GetOrCreate(channelID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	recv, unsub, err := ch.Subscribe()
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer unsub()

	conn, err := websocket.Accept(w, r, acceptOptions())
	if err != nil {
		s.Logger.Warn("subscribe accept failed", "err", err)
		return
	}
	defer conn.Close(websocket.StatusInternalError, "subscriber closed")

	if conn.Subprotocol() != wire.Subprotocol {
		_ = conn.Close(websocket.StatusPolicyViolation, "subprotocol mismatch")
		return
	}

	// Subscribers don't send us anything we read; we just write.
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Watcher goroutine: if the client closes or errors out, cancel ctx.
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				cancel()
				return
			}
		}
	}()

	s.Logger.Info("subscriber connected", "channel", channelID)
	defer s.Logger.Info("subscriber disconnected", "channel", channelID)

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-recv:
			if !ok {
				return
			}
			writeCtx, cancelWrite := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(writeCtx, websocket.MessageBinary, msg)
			cancelWrite()
			if err != nil {
				return
			}
		}
	}
}

// Metrics writes a basic textual snapshot. Prometheus-friendly key=value lines.
func (s *Server) WriteMetrics(w http.ResponseWriter) {
	snapshot := s.Reg.Snapshot()
	totalSubs := 0
	for _, st := range snapshot {
		totalSubs += st.Subscribers
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	header := "# StreamMix relay metrics\n"
	_, _ = w.Write([]byte(header))
	writeMetric := func(name string, value uint64) {
		_, _ = w.Write([]byte(name))
		_, _ = w.Write([]byte(" "))
		_, _ = w.Write(uint64DecimalBytes(value))
		_, _ = w.Write([]byte("\n"))
	}
	writeMetric("relay_active_channels", uint64(len(snapshot)))
	writeMetric("relay_active_subscribers", uint64(totalSubs))
	writeMetric("relay_packets_relayed_total", s.packetsRelayed.Load())
	writeMetric("relay_bytes_relayed_total", s.bytesRelayed.Load())
	writeMetric("relay_publisher_auth_failures_total", s.authFailures.Load())
	writeMetric("relay_uptime_seconds", uint64(time.Since(s.StartedAt).Seconds()))
}

func uint64DecimalBytes(v uint64) []byte {
	if v == 0 {
		return []byte("0")
	}
	var buf [20]byte
	pos := len(buf)
	for v > 0 {
		pos--
		buf[pos] = byte('0' + v%10)
		v /= 10
	}
	return buf[pos:]
}
