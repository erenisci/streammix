package wire

import (
	"bytes"
	"errors"
	"testing"
)

// ---------- header ----------

func TestHeaderConstants(t *testing.T) {
	if HeaderBytes != 21 {
		t.Fatalf("HeaderBytes=%d, want 21", HeaderBytes)
	}
	if !bytes.Equal(Magic[:], []byte{0x53, 0x4d, 0x58, 0x31}) {
		t.Fatalf("Magic mismatch")
	}
}

func TestEncodeDecodeEmptyAudioFrame(t *testing.T) {
	f := Frame{Type: TypeAudioOpus, Track: 1, Seq: 42, TimestampMS: 1234567890}
	buf, err := EncodeFrame(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(buf) != HeaderBytes {
		t.Fatalf("len=%d, want %d", len(buf), HeaderBytes)
	}
	got, err := DecodeFrame(buf)
	if err != nil {
		t.Fatal(err)
	}
	if got.Type != f.Type || got.Track != f.Track || got.Seq != f.Seq || got.TimestampMS != f.TimestampMS {
		t.Fatalf("field mismatch: %+v vs %+v", got, f)
	}
	if len(got.Payload) != 0 {
		t.Fatalf("payload should be empty")
	}
}

func TestEncodeFieldOffsets(t *testing.T) {
	f := Frame{
		Type:        TypeHello,
		Track:       0,
		Flags:       0,
		Seq:         0x01020304,
		TimestampMS: 0x1122334455667788,
		Payload:     []byte{0xaa},
	}
	buf, err := EncodeFrame(f)
	if err != nil {
		t.Fatal(err)
	}
	want := []byte{
		0x53, 0x4d, 0x58, 0x31, // MAGIC
		byte(TypeHello),
		0x00, // TRACK
		0x00, // FLAGS
		0x00, 0x01, // PAYLOAD_LEN
		0x01, 0x02, 0x03, 0x04, // SEQ
		0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, // TS
		0xaa, // payload
	}
	if !bytes.Equal(buf, want) {
		t.Fatalf("byte mismatch:\n got=%x\nwant=%x", buf, want)
	}
}

func TestDecodeRejectsShortFrame(t *testing.T) {
	_, err := DecodeFrame(make([]byte, 10))
	requireKind(t, err, BadLength)
}

func TestDecodeRejectsBadMagic(t *testing.T) {
	buf := make([]byte, HeaderBytes)
	// Magic is all zeros
	_, err := DecodeFrame(buf)
	requireKind(t, err, BadMagic)
}

func TestDecodeRejectsLengthMismatch(t *testing.T) {
	f := Frame{Type: TypeAudioOpus, Track: 1, Payload: []byte{1, 2, 3}}
	buf, _ := EncodeFrame(f)
	_, err := DecodeFrame(buf[:len(buf)-1])
	requireKind(t, err, BadLength)
}

func TestDecodeRejectsHugePayloadClaim(t *testing.T) {
	buf := make([]byte, HeaderBytes)
	copy(buf[0:4], Magic[:])
	buf[4] = byte(TypeAudioOpus)
	buf[5] = 1
	// declared length = MAX+1
	buf[7] = byte((MaxPayloadBytes + 1) >> 8)
	buf[8] = byte((MaxPayloadBytes + 1) & 0xff)
	_, err := DecodeFrame(buf)
	requireKind(t, err, TooLarge)
}

func TestEncodeRejectsHugePayload(t *testing.T) {
	f := Frame{Type: TypeAudioOpus, Track: 1, Payload: make([]byte, MaxPayloadBytes+1)}
	_, err := EncodeFrame(f)
	requireKind(t, err, TooLarge)
}

func TestEncodeRejectsBadTrack(t *testing.T) {
	f := Frame{Type: TypeAudioOpus, Track: MaxTrackSlot + 1}
	_, err := EncodeFrame(f)
	requireKind(t, err, BadTrack)
}

func TestDecodeRejectsUnknownType(t *testing.T) {
	buf := make([]byte, HeaderBytes)
	copy(buf[0:4], Magic[:])
	buf[4] = 0x77
	_, err := DecodeFrame(buf)
	requireKind(t, err, BadType)
}

func TestDecodeRejectsBadTrack(t *testing.T) {
	buf := make([]byte, HeaderBytes)
	copy(buf[0:4], Magic[:])
	buf[4] = byte(TypeAudioOpus)
	buf[5] = 0xff
	_, err := DecodeFrame(buf)
	requireKind(t, err, BadTrack)
}

func TestPayloadCopyDoesNotAliasInput(t *testing.T) {
	f := Frame{Type: TypeAudioOpus, Track: 1, Payload: []byte{1, 2, 3, 4}}
	buf, _ := EncodeFrame(f)
	decoded, _ := DecodeFrame(buf)
	// Mutate input — decoded payload must not change.
	for i := range buf {
		buf[i] = 0
	}
	if !bytes.Equal(decoded.Payload, []byte{1, 2, 3, 4}) {
		t.Fatalf("payload aliases input: %x", decoded.Payload)
	}
}

// ---------- categories ----------

func TestPresetCategoriesCount(t *testing.T) {
	if len(PresetCategories) != 8 {
		t.Fatalf("PresetCategories len=%d, want 8", len(PresetCategories))
	}
}

func TestIsPresetCategoryExactMatch(t *testing.T) {
	if !IsPresetCategory("mic") {
		t.Fatal("mic should be preset")
	}
	if IsPresetCategory("MIC") {
		t.Fatal("MIC must not be preset (case-sensitive)")
	}
	if IsPresetCategory(CustomCategory) {
		t.Fatal("custom is not a preset")
	}
}

func TestSluggify(t *testing.T) {
	cases := map[string]string{
		"Co-host Mic": "co-host-mic",
		"My Channel!": "my-channel",
		"   trim   ":  "trim",
	}
	for in, want := range cases {
		if got := Sluggify(in); got != want {
			t.Errorf("Sluggify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsValidSlug(t *testing.T) {
	ok := []string{"mic", "co-host-mic", "a", "ab-cd-ef"}
	bad := []string{"", "MIC", "-leading", "trailing-", "double--dash"}
	for _, s := range ok {
		if !IsValidSlug(s) {
			t.Errorf("expected valid: %q", s)
		}
	}
	for _, s := range bad {
		if IsValidSlug(s) {
			t.Errorf("expected invalid: %q", s)
		}
	}
}

// ---------- payloads ----------

func TestHelloRoundTrip(t *testing.T) {
	h := Hello{Version: 1, Client: "extension/0.1.0"}
	h.Audio.Codec = "opus"
	h.Audio.SampleRate = 48000
	h.Audio.Channels = 2
	h.Audio.FrameMS = 20
	buf, err := EncodeHello(h)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeHello(buf)
	if err != nil {
		t.Fatal(err)
	}
	if got != h {
		t.Fatalf("mismatch: %+v vs %+v", got, h)
	}
}

func TestHelloRejectsWrongVersion(t *testing.T) {
	buf := []byte(`{"version":2,"client":"x","audio":{"codec":"opus","sample_rate":48000,"channels":2,"frame_ms":20}}`)
	_, err := DecodeHello(buf)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestTrackListRoundTrip(t *testing.T) {
	tl := TrackList{Tracks: []TrackInfo{
		{ID: 1, Slug: "mic", Category: "mic", Label: "Microphone"},
		{ID: 2, Slug: "co-host-mic", Category: CustomCategory, Label: "Co-host"},
	}}
	buf, err := EncodeTrackList(tl)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeTrackList(buf)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tracks) != 2 {
		t.Fatalf("len=%d", len(got.Tracks))
	}
}

func TestTrackListRejectsDuplicateID(t *testing.T) {
	buf := []byte(`{"tracks":[{"id":1,"slug":"mic","category":"mic","label":"A"},{"id":1,"slug":"game","category":"game","label":"B"}]}`)
	_, err := DecodeTrackList(buf)
	if err == nil {
		t.Fatal("expected duplicate error")
	}
}

func TestTrackListRejectsTooMany(t *testing.T) {
	buf := []byte(`{"tracks":[{"id":1,"slug":"a","category":"custom","label":"A"},{"id":2,"slug":"b","category":"custom","label":"B"},{"id":3,"slug":"c","category":"custom","label":"C"},{"id":4,"slug":"d","category":"custom","label":"D"},{"id":5,"slug":"e","category":"custom","label":"E"},{"id":6,"slug":"f","category":"custom","label":"F"},{"id":7,"slug":"g","category":"custom","label":"G"},{"id":8,"slug":"h","category":"custom","label":"H"},{"id":9,"slug":"i","category":"custom","label":"I"}]}`)
	_, err := DecodeTrackList(buf)
	if err == nil {
		t.Fatal("expected too-many error")
	}
}

func TestFingerprintRoundTrip(t *testing.T) {
	fp := Fingerprint{Hash: 0x0123456789abcdef, WindowMS: 1000}
	buf := EncodeFingerprint(fp)
	got, err := DecodeFingerprint(buf)
	if err != nil {
		t.Fatal(err)
	}
	if got != fp {
		t.Fatalf("mismatch: %+v vs %+v", got, fp)
	}
}

func TestFingerprintWrongLength(t *testing.T) {
	if _, err := DecodeFingerprint(make([]byte, 9)); err == nil {
		t.Fatal("expected length error")
	}
	if _, err := DecodeFingerprint(make([]byte, 11)); err == nil {
		t.Fatal("expected length error")
	}
}

func TestTrackMetaRejectsHTTPAlbumArt(t *testing.T) {
	buf := []byte(`{"album_art_url":"http://example.com/a.jpg"}`)
	_, err := DecodeTrackMeta(buf)
	if err == nil {
		t.Fatal("expected https-only error")
	}
}

func TestStatsRejectsNegative(t *testing.T) {
	buf := []byte(`{"uptime_s":-1,"packets_sent":0,"subscribers":0,"tracks_active":0}`)
	_, err := DecodeStats(buf)
	if err == nil {
		t.Fatal("expected non-negative error")
	}
}

func TestSubTracksRejectsDuplicate(t *testing.T) {
	buf := []byte(`{"tracks":[1,1]}`)
	_, err := DecodeSubTracks(buf)
	if err == nil {
		t.Fatal("expected duplicate error")
	}
}

func TestErrorRejectsUnknownCode(t *testing.T) {
	buf := []byte(`{"code":"GREMLINS","message":"uh oh"}`)
	_, err := DecodeError(buf)
	if err == nil {
		t.Fatal("expected error-code error")
	}
}

func TestDecJSONRejectsInvalidUTF8(t *testing.T) {
	buf := []byte{0xff, 0xfe, 0xfd}
	_, err := DecodeStats(buf)
	if err == nil {
		t.Fatal("expected utf-8 error")
	}
}

func TestDecJSONRejectsUnknownFields(t *testing.T) {
	buf := []byte(`{"uptime_s":0,"packets_sent":0,"subscribers":0,"tracks_active":0,"extra":1}`)
	_, err := DecodeStats(buf)
	if err == nil {
		t.Fatal("expected unknown-field error")
	}
}

// ---------- helpers ----------

func requireKind(t *testing.T, err error, want ProtocolErrorKind) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error of kind %s, got nil", want)
	}
	var pe *ProtocolError
	if !errors.As(err, &pe) {
		t.Fatalf("expected *ProtocolError, got %T: %v", err, err)
	}
	if pe.Kind != want {
		t.Fatalf("kind=%s, want %s; msg=%s", pe.Kind, want, pe.Message)
	}
}
