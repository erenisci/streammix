package internal

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
	"time"
)

// ErrBadToken is returned when a token fails any validation step.
var ErrBadToken = errors.New("bad token")

// Token layout (URL-safe base64, no padding):
//   "<channel_id>|<expiry_unix_seconds>|<hmac_sha256(channel_id ++ expiry, secret)>"
//
// The channel id and expiry are inside the MAC, so neither can be changed
// without invalidating the token.

const tokenSep = "|"

// MintToken produces a publisher token for the given channel and ttl.
// secret must be a high-entropy server-side secret.
func MintToken(secret []byte, channelID string, ttl time.Duration) (string, error) {
	if err := ValidateChannelID(channelID); err != nil {
		return "", err
	}
	exp := time.Now().Add(ttl).Unix()
	mac := sign(secret, channelID, exp)
	expBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(expBytes, uint64(exp))
	parts := []string{
		base64.RawURLEncoding.EncodeToString([]byte(channelID)),
		base64.RawURLEncoding.EncodeToString(expBytes),
		base64.RawURLEncoding.EncodeToString(mac),
	}
	return strings.Join(parts, tokenSep), nil
}

// VerifyToken checks that the token is well-formed, unexpired, MAC-valid, and
// authorises the given channelID. Constant-time comparisons throughout.
func VerifyToken(secret []byte, channelID, token string) error {
	if len(token) == 0 || len(token) > 512 {
		return ErrBadToken
	}
	parts := strings.Split(token, tokenSep)
	if len(parts) != 3 {
		return ErrBadToken
	}
	tokChan, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return ErrBadToken
	}
	expBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(expBytes) != 8 {
		return ErrBadToken
	}
	mac, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(mac) != sha256.Size {
		return ErrBadToken
	}

	// Channel match — constant time.
	if !hmac.Equal(tokChan, []byte(channelID)) {
		return ErrBadToken
	}

	exp := int64(binary.BigEndian.Uint64(expBytes))
	if exp <= time.Now().Unix() {
		return ErrBadToken
	}

	want := sign(secret, channelID, exp)
	if !hmac.Equal(mac, want) {
		return ErrBadToken
	}
	return nil
}

func sign(secret []byte, channelID string, exp int64) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(channelID))
	h.Write([]byte{0}) // domain separator between fields
	expBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(expBytes, uint64(exp))
	h.Write(expBytes)
	return h.Sum(nil)
}

// NewSecret generates a fresh 32-byte secret. Use once at relay deploy.
func NewSecret() ([]byte, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}
