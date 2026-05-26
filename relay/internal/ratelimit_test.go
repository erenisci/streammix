package internal

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllowsBelowThreshold(t *testing.T) {
	l := &FailedAuthLimiter{Threshold: 3, Window: time.Minute, Cooldown: time.Minute, entries: map[string]*authEntry{}}
	for i := 0; i < 2; i++ {
		if !l.Allowed("1.1.1.1") {
			t.Fatalf("should be allowed at attempt %d", i)
		}
		l.RecordFailure("1.1.1.1")
	}
}

func TestRateLimiterBlocksAfterThreshold(t *testing.T) {
	l := &FailedAuthLimiter{Threshold: 3, Window: time.Minute, Cooldown: time.Minute, entries: map[string]*authEntry{}}
	for i := 0; i < 3; i++ {
		l.RecordFailure("1.1.1.1")
	}
	if l.Allowed("1.1.1.1") {
		t.Fatal("should be blocked after threshold")
	}
}

func TestRateLimiterPerIP(t *testing.T) {
	l := &FailedAuthLimiter{Threshold: 3, Window: time.Minute, Cooldown: time.Minute, entries: map[string]*authEntry{}}
	for i := 0; i < 3; i++ {
		l.RecordFailure("1.1.1.1")
	}
	if !l.Allowed("2.2.2.2") {
		t.Fatal("other IP must not be affected")
	}
}

func TestRateLimiterSuccessClears(t *testing.T) {
	l := &FailedAuthLimiter{Threshold: 3, Window: time.Minute, Cooldown: time.Minute, entries: map[string]*authEntry{}}
	for i := 0; i < 3; i++ {
		l.RecordFailure("1.1.1.1")
	}
	l.RecordSuccess("1.1.1.1")
	if !l.Allowed("1.1.1.1") {
		t.Fatal("success must clear ban")
	}
}

func TestRateLimiterWindowExpires(t *testing.T) {
	l := &FailedAuthLimiter{Threshold: 3, Window: 10 * time.Millisecond, Cooldown: time.Minute, entries: map[string]*authEntry{}}
	for i := 0; i < 2; i++ {
		l.RecordFailure("1.1.1.1")
	}
	time.Sleep(20 * time.Millisecond)
	l.RecordFailure("1.1.1.1") // would be the 3rd, but window reset → 1
	if !l.Allowed("1.1.1.1") {
		t.Fatal("window should have reset")
	}
}

func TestClientIPPrefersXFF(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 10.0.0.1")
	r.RemoteAddr = "127.0.0.1:1234"
	if ip := ClientIP(r); ip != "1.2.3.4" {
		t.Fatalf("got %q, want 1.2.3.4", ip)
	}
}

func TestClientIPFallbackRemoteAddr(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "5.5.5.5:9999"
	if ip := ClientIP(r); ip != "5.5.5.5" {
		t.Fatalf("got %q, want 5.5.5.5", ip)
	}
}

var _ http.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
