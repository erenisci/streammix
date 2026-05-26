package internal

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// FailedAuthLimiter throttles publisher token attempts per source IP to slow
// down brute-force / credential-stuffing. Subscriber endpoint isn't gated.
//
// Algorithm: sliding window. Each IP that fails auth gets a counter; once it
// crosses Threshold within Window, further requests are denied for Cooldown.
// No fancy LRU — entries are reaped lazily.
type FailedAuthLimiter struct {
	Threshold int
	Window    time.Duration
	Cooldown  time.Duration

	mu      sync.Mutex
	entries map[string]*authEntry
}

type authEntry struct {
	count        int
	firstFailMS  int64
	bannedUntilMS int64
}

// NewFailedAuthLimiter returns a limiter with sensible defaults.
func NewFailedAuthLimiter() *FailedAuthLimiter {
	return &FailedAuthLimiter{
		Threshold: 5,
		Window:    time.Minute,
		Cooldown:  5 * time.Minute,
		entries:   make(map[string]*authEntry),
	}
}

// Allowed reports whether this IP is currently permitted to attempt auth.
// Returns false if the IP is in cooldown after exceeding Threshold.
func (l *FailedAuthLimiter) Allowed(ip string) bool {
	now := time.Now().UnixMilli()
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[ip]
	if !ok {
		return true
	}
	if e.bannedUntilMS != 0 && now < e.bannedUntilMS {
		return false
	}
	if e.bannedUntilMS != 0 && now >= e.bannedUntilMS {
		delete(l.entries, ip)
		return true
	}
	return true
}

// RecordFailure increments the failure counter for ip. If the counter crosses
// Threshold within Window, the IP enters cooldown.
func (l *FailedAuthLimiter) RecordFailure(ip string) {
	now := time.Now().UnixMilli()
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.entries[ip]
	if !ok {
		l.entries[ip] = &authEntry{count: 1, firstFailMS: now}
		return
	}
	// Reset window if expired.
	if now-e.firstFailMS > l.Window.Milliseconds() {
		e.count = 1
		e.firstFailMS = now
		e.bannedUntilMS = 0
		return
	}
	e.count++
	if e.count >= l.Threshold {
		e.bannedUntilMS = now + l.Cooldown.Milliseconds()
	}
}

// RecordSuccess clears any prior failure state for the IP.
func (l *FailedAuthLimiter) RecordSuccess(ip string) {
	l.mu.Lock()
	delete(l.entries, ip)
	l.mu.Unlock()
}

// ClientIP best-effort extracts the source IP from an HTTP request. We prefer
// the leftmost X-Forwarded-For entry (set by trusted reverse proxies) and fall
// back to r.RemoteAddr. Operators should make sure their proxy is the only
// thing setting these headers in production; otherwise the limiter is
// trivially bypassable.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if comma := strings.IndexByte(xff, ','); comma > 0 {
			return strings.TrimSpace(xff[:comma])
		}
		return strings.TrimSpace(xff)
	}
	// r.RemoteAddr is "ip:port" — strip the port.
	addr := r.RemoteAddr
	if colon := strings.LastIndexByte(addr, ':'); colon > 0 {
		return addr[:colon]
	}
	return addr
}
