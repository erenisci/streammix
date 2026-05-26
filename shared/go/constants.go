// Package wire is the canonical StreamMix wire-format codec for Go.
// Spec mirror of shared/ts/. Keep both implementations in sync.
package wire

// Magic is the ASCII "SMX1" — first four bytes of every frame.
var Magic = [4]byte{0x53, 0x4d, 0x58, 0x31}

// Subprotocol is the WebSocket subprotocol identifier.
const Subprotocol = "streammix.v1"

// HeaderBytes is the fixed-width header length (MAGIC..TIMESTAMP_MS).
const HeaderBytes = 21

// MaxPayloadBytes is the maximum payload length we'll accept (DoS bound).
const MaxPayloadBytes = 4096

// MaxTrackSlot is the highest track slot that may carry audio. 0x00 is control.
const MaxTrackSlot = 0x08

// MaxTracks is the hard cap on simultaneously active tracks per publisher.
const MaxTracks = 8

// ControlTrack is the track slot reserved for control messages.
const ControlTrack = 0x00

// MessageType is the on-wire message type byte.
type MessageType uint8

const (
	TypeHello       MessageType = 0x01
	TypeTrackList   MessageType = 0x02
	TypeAudioOpus   MessageType = 0x03
	TypeFingerprint MessageType = 0x04
	TypeTrackMeta   MessageType = 0x05
	TypeStats       MessageType = 0x10
	TypeSubTracks   MessageType = 0x20
	TypeError       MessageType = 0xff
)

// IsKnownType reports whether a TYPE byte corresponds to a known message.
// Unknown types are rejected at the codec layer; forward-compat decisions are
// made by the caller (drop silently, etc.).
func IsKnownType(t uint8) bool {
	switch MessageType(t) {
	case TypeHello, TypeTrackList, TypeAudioOpus, TypeFingerprint,
		TypeTrackMeta, TypeStats, TypeSubTracks, TypeError:
		return true
	}
	return false
}
