package wire

import "fmt"

// ErrorCode is the on-wire ERROR.code value.
type ErrorCode string

const (
	ErrAuthFailed      ErrorCode = "AUTH_FAILED"
	ErrChannelTaken    ErrorCode = "CHANNEL_TAKEN"
	ErrVersionMismatch ErrorCode = "VERSION_MISMATCH"
	ErrRateLimit       ErrorCode = "RATE_LIMIT"
	ErrTrackLimit      ErrorCode = "TRACK_LIMIT"
	ErrMalformed       ErrorCode = "MALFORMED"
)

// IsErrorCode reports whether a string is a recognised wire error code.
func IsErrorCode(s string) bool {
	switch ErrorCode(s) {
	case ErrAuthFailed, ErrChannelTaken, ErrVersionMismatch,
		ErrRateLimit, ErrTrackLimit, ErrMalformed:
		return true
	}
	return false
}

// ProtocolErrorKind is a coarse classification of decode failures.
type ProtocolErrorKind string

const (
	BadMagic   ProtocolErrorKind = "BAD_MAGIC"
	BadLength  ProtocolErrorKind = "BAD_LENGTH"
	BadTrack   ProtocolErrorKind = "BAD_TRACK"
	BadType    ProtocolErrorKind = "BAD_TYPE"
	BadPayload ProtocolErrorKind = "BAD_PAYLOAD"
	TooLarge   ProtocolErrorKind = "TOO_LARGE"
)

// ProtocolError is returned by the codec when the wire contract is violated.
type ProtocolError struct {
	Kind    ProtocolErrorKind
	Message string
}

func (e *ProtocolError) Error() string {
	return fmt.Sprintf("wire: %s: %s", e.Kind, e.Message)
}

func protoErr(kind ProtocolErrorKind, format string, args ...any) *ProtocolError {
	return &ProtocolError{Kind: kind, Message: fmt.Sprintf(format, args...)}
}
