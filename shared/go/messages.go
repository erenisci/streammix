package wire

import (
	"encoding/binary"
	"encoding/json"
	"strings"
	"unicode/utf8"
)

const maxJSONBytes = 4096

// ---------- HELLO ----------

type Hello struct {
	Version int    `json:"version"`
	Client  string `json:"client"`
	Audio   struct {
		Codec      string `json:"codec"`
		SampleRate int    `json:"sample_rate"`
		Channels   int    `json:"channels"`
		FrameMS    int    `json:"frame_ms"`
	} `json:"audio"`
}

func EncodeHello(h Hello) ([]byte, error) { return encJSON(h) }

func DecodeHello(buf []byte) (Hello, error) {
	var h Hello
	if err := decJSON(buf, &h); err != nil {
		return Hello{}, err
	}
	if h.Version != 1 {
		return Hello{}, bad("hello.version")
	}
	if err := checkStr("client", h.Client, 128); err != nil {
		return Hello{}, err
	}
	if h.Audio.Codec != "opus" {
		return Hello{}, bad("hello.audio.codec")
	}
	if h.Audio.SampleRate != 48000 {
		return Hello{}, bad("hello.audio.sample_rate")
	}
	if h.Audio.Channels != 1 && h.Audio.Channels != 2 {
		return Hello{}, bad("hello.audio.channels")
	}
	if h.Audio.FrameMS != 20 {
		return Hello{}, bad("hello.audio.frame_ms")
	}
	return h, nil
}

// ---------- TRACK_LIST ----------

type TrackInfo struct {
	ID       uint8  `json:"id"`
	Slug     string `json:"slug"`
	Category string `json:"category"`
	Label    string `json:"label"`
}

type TrackList struct {
	Tracks []TrackInfo `json:"tracks"`
}

func EncodeTrackList(t TrackList) ([]byte, error) { return encJSON(t) }

func DecodeTrackList(buf []byte) (TrackList, error) {
	var t TrackList
	if err := decJSON(buf, &t); err != nil {
		return TrackList{}, err
	}
	if len(t.Tracks) > MaxTrackSlot {
		return TrackList{}, bad("track_list too many tracks")
	}
	seen := make(map[uint8]bool, len(t.Tracks))
	for _, tr := range t.Tracks {
		if tr.ID < 1 || tr.ID > MaxTrackSlot {
			return TrackList{}, bad("track.id")
		}
		if seen[tr.ID] {
			return TrackList{}, bad("track.id duplicate")
		}
		seen[tr.ID] = true
		if err := checkStr("track.slug", tr.Slug, 64); err != nil {
			return TrackList{}, err
		}
		if !IsValidSlug(tr.Slug) {
			return TrackList{}, bad("track.slug format")
		}
		if tr.Category != CustomCategory && !IsPresetCategory(tr.Category) {
			return TrackList{}, bad("track.category")
		}
		if err := checkStr("track.label", tr.Label, 64); err != nil {
			return TrackList{}, err
		}
	}
	return t, nil
}

// ---------- FINGERPRINT ----------

type Fingerprint struct {
	Hash     uint64
	WindowMS uint16
}

func EncodeFingerprint(f Fingerprint) []byte {
	buf := make([]byte, 10)
	binary.BigEndian.PutUint64(buf[0:8], f.Hash)
	binary.BigEndian.PutUint16(buf[8:10], f.WindowMS)
	return buf
}

func DecodeFingerprint(buf []byte) (Fingerprint, error) {
	if len(buf) != 10 {
		return Fingerprint{}, bad("fingerprint length")
	}
	return Fingerprint{
		Hash:     binary.BigEndian.Uint64(buf[0:8]),
		WindowMS: binary.BigEndian.Uint16(buf[8:10]),
	}, nil
}

// ---------- TRACK_META ----------

type TrackMeta struct {
	Title       string `json:"title,omitempty"`
	Artist      string `json:"artist,omitempty"`
	AlbumArtURL string `json:"album_art_url,omitempty"`
}

func EncodeTrackMeta(m TrackMeta) ([]byte, error) { return encJSON(m) }

func DecodeTrackMeta(buf []byte) (TrackMeta, error) {
	var m TrackMeta
	if err := decJSON(buf, &m); err != nil {
		return TrackMeta{}, err
	}
	if err := checkStr("title", m.Title, 256); err != nil {
		return TrackMeta{}, err
	}
	if err := checkStr("artist", m.Artist, 256); err != nil {
		return TrackMeta{}, err
	}
	if err := checkStr("album_art_url", m.AlbumArtURL, 1024); err != nil {
		return TrackMeta{}, err
	}
	if m.AlbumArtURL != "" && !strings.HasPrefix(m.AlbumArtURL, "https://") {
		return TrackMeta{}, bad("album_art_url must be https")
	}
	return m, nil
}

// ---------- STATS ----------

type Stats struct {
	UptimeS      int64 `json:"uptime_s"`
	PacketsSent  int64 `json:"packets_sent"`
	Subscribers  int64 `json:"subscribers"`
	TracksActive int64 `json:"tracks_active"`
}

func EncodeStats(s Stats) ([]byte, error) { return encJSON(s) }

func DecodeStats(buf []byte) (Stats, error) {
	var s Stats
	if err := decJSON(buf, &s); err != nil {
		return Stats{}, err
	}
	if s.UptimeS < 0 || s.PacketsSent < 0 || s.Subscribers < 0 || s.TracksActive < 0 {
		return Stats{}, bad("stats: non-negative required")
	}
	return s, nil
}

// ---------- SUB_TRACKS ----------

type SubTracks struct {
	Tracks []uint8 `json:"tracks"`
}

func EncodeSubTracks(s SubTracks) ([]byte, error) { return encJSON(s) }

func DecodeSubTracks(buf []byte) (SubTracks, error) {
	var s SubTracks
	if err := decJSON(buf, &s); err != nil {
		return SubTracks{}, err
	}
	if len(s.Tracks) > MaxTrackSlot {
		return SubTracks{}, bad("sub_tracks too many")
	}
	seen := make(map[uint8]bool, len(s.Tracks))
	for _, id := range s.Tracks {
		if id < 1 || id > MaxTrackSlot {
			return SubTracks{}, bad("sub_tracks.id")
		}
		if seen[id] {
			return SubTracks{}, bad("sub_tracks.id duplicate")
		}
		seen[id] = true
	}
	return s, nil
}

// ---------- ERROR ----------

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func EncodeError(e ErrorPayload) ([]byte, error) { return encJSON(e) }

func DecodeError(buf []byte) (ErrorPayload, error) {
	var e ErrorPayload
	if err := decJSON(buf, &e); err != nil {
		return ErrorPayload{}, err
	}
	if !IsErrorCode(e.Code) {
		return ErrorPayload{}, bad("error.code")
	}
	if err := checkStr("error.message", e.Message, 512); err != nil {
		return ErrorPayload{}, err
	}
	return e, nil
}

// ---------- helpers ----------

func encJSON(v any) ([]byte, error) {
	out, err := json.Marshal(v)
	if err != nil {
		return nil, protoErr(BadPayload, "json marshal: %v", err)
	}
	if len(out) > maxJSONBytes {
		return nil, protoErr(TooLarge, "json payload too large: %d", len(out))
	}
	return out, nil
}

func decJSON(buf []byte, v any) error {
	if len(buf) > maxJSONBytes {
		return protoErr(TooLarge, "json payload too large: %d", len(buf))
	}
	if !utf8.Valid(buf) {
		return protoErr(BadPayload, "invalid utf-8")
	}
	dec := json.NewDecoder(strings.NewReader(string(buf)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return protoErr(BadPayload, "json: %v", err)
	}
	// reject trailing junk
	if dec.More() {
		return protoErr(BadPayload, "trailing json data")
	}
	return nil
}

func checkStr(field, v string, maxLen int) error {
	if len(v) > maxLen {
		return protoErr(BadPayload, "field %s too long", field)
	}
	return nil
}

func bad(detail string) error {
	return protoErr(BadPayload, "%s", detail)
}

