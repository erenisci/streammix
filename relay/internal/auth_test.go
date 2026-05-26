package internal

import (
	"strings"
	"testing"
	"time"
)

func TestTokenRoundTrip(t *testing.T) {
	secret, _ := NewSecret()
	channel := "twitch:streamer1"
	tok, err := MintToken(secret, channel, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyToken(secret, channel, tok); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func TestTokenWrongChannelRejected(t *testing.T) {
	secret, _ := NewSecret()
	tok, _ := MintToken(secret, "twitch:alice", time.Hour)
	if err := VerifyToken(secret, "twitch:bob", tok); err == nil {
		t.Fatal("expected mismatch error")
	}
}

func TestTokenWrongSecretRejected(t *testing.T) {
	a, _ := NewSecret()
	b, _ := NewSecret()
	tok, _ := MintToken(a, "twitch:alice", time.Hour)
	if err := VerifyToken(b, "twitch:alice", tok); err == nil {
		t.Fatal("expected MAC mismatch error")
	}
}

func TestTokenExpired(t *testing.T) {
	secret, _ := NewSecret()
	tok, _ := MintToken(secret, "twitch:alice", -time.Second)
	if err := VerifyToken(secret, "twitch:alice", tok); err == nil {
		t.Fatal("expected expiry error")
	}
}

func TestTokenMalformed(t *testing.T) {
	secret, _ := NewSecret()
	cases := []string{
		"",
		"only-one-segment",
		"a|b",
		"not|valid|base64!",
		strings.Repeat("a", 1024),
	}
	for _, c := range cases {
		if err := VerifyToken(secret, "twitch:alice", c); err == nil {
			t.Errorf("expected error for token %q", c)
		}
	}
}

func TestMintRejectsBadChannel(t *testing.T) {
	secret, _ := NewSecret()
	if _, err := MintToken(secret, "BAD CHANNEL", time.Hour); err == nil {
		t.Fatal("expected bad-channel error")
	}
}
