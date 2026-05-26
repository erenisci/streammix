package wire

import "encoding/binary"

// Frame is a decoded wire frame. Payload retains its raw bytes — callers
// dispatch on Type and call the appropriate decode* function for JSON payloads.
type Frame struct {
	Type        MessageType
	Track       uint8
	Flags       uint8
	Seq         uint32
	TimestampMS uint64
	Payload     []byte
}

// EncodeFrame serialises f into a single binary message. All field bounds are
// validated; the function never produces output the decoder would reject.
func EncodeFrame(f Frame) ([]byte, error) {
	if len(f.Payload) > MaxPayloadBytes {
		return nil, protoErr(TooLarge, "payload too large: %d > %d", len(f.Payload), MaxPayloadBytes)
	}
	if f.Track > MaxTrackSlot {
		return nil, protoErr(BadTrack, "invalid track slot: %d", f.Track)
	}
	if !IsKnownType(uint8(f.Type)) {
		return nil, protoErr(BadType, "unknown message type: 0x%02x", uint8(f.Type))
	}

	buf := make([]byte, HeaderBytes+len(f.Payload))
	copy(buf[0:4], Magic[:])
	buf[4] = uint8(f.Type)
	buf[5] = f.Track
	buf[6] = f.Flags
	binary.BigEndian.PutUint16(buf[7:9], uint16(len(f.Payload)))
	binary.BigEndian.PutUint32(buf[9:13], f.Seq)
	binary.BigEndian.PutUint64(buf[13:21], f.TimestampMS)
	copy(buf[HeaderBytes:], f.Payload)
	return buf, nil
}

// DecodeFrame parses raw bytes into a Frame. Every field is bounds-checked
// before the payload slice is taken; the function does not retain a reference
// to the input slice (it sub-slices the payload, so callers should not retain
// large input buffers after decoding small frames).
func DecodeFrame(input []byte) (Frame, error) {
	if len(input) < HeaderBytes {
		return Frame{}, protoErr(BadLength, "frame shorter than header: %d < %d", len(input), HeaderBytes)
	}
	for i := 0; i < 4; i++ {
		if input[i] != Magic[i] {
			return Frame{}, protoErr(BadMagic, "magic mismatch")
		}
	}
	typ := input[4]
	track := input[5]
	flags := input[6]
	payloadLen := binary.BigEndian.Uint16(input[7:9])
	seq := binary.BigEndian.Uint32(input[9:13])
	ts := binary.BigEndian.Uint64(input[13:21])

	if int(payloadLen) > MaxPayloadBytes {
		return Frame{}, protoErr(TooLarge, "payload too large: %d", payloadLen)
	}
	if HeaderBytes+int(payloadLen) != len(input) {
		return Frame{}, protoErr(BadLength, "length mismatch: declared %d, got %d",
			payloadLen, len(input)-HeaderBytes)
	}
	if track > MaxTrackSlot {
		return Frame{}, protoErr(BadTrack, "invalid track slot: %d", track)
	}
	if !IsKnownType(typ) {
		return Frame{}, protoErr(BadType, "unknown message type: 0x%02x", typ)
	}

	// Copy payload so the returned Frame doesn't pin the caller's input buffer.
	payload := make([]byte, payloadLen)
	copy(payload, input[HeaderBytes:HeaderBytes+int(payloadLen)])

	return Frame{
		Type:        MessageType(typ),
		Track:       track,
		Flags:       flags,
		Seq:         seq,
		TimestampMS: ts,
		Payload:     payload,
	}, nil
}
