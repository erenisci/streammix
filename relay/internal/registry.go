package internal

import (
	"errors"
	"regexp"
	"sync"
)

// ErrChannelLimit is returned when the global channel cap is reached.
var ErrChannelLimit = errors.New("global channel limit reached")

// ErrBadChannelID is returned for malformed channel identifiers.
var ErrBadChannelID = errors.New("invalid channel id")

// channelIDRe enforces the on-the-wire channel name shape:
// "<platform>:<name>", both segments lowercase ASCII, name 1..64 chars.
var channelIDRe = regexp.MustCompile(`^(twitch|kick):[a-z0-9_]{1,64}$`)

// ValidateChannelID returns ErrBadChannelID if the id doesn't match the shape.
// Validating here means the rest of the relay can rely on the contract.
func ValidateChannelID(id string) error {
	if !channelIDRe.MatchString(id) {
		return ErrBadChannelID
	}
	return nil
}

// Registry is the lookup table of all active channels.
type Registry struct {
	mu          sync.Mutex
	channels    map[string]*Channel
	maxChannels int
	maxSubs     int
	sendBuf     int
}

// NewRegistry constructs a Registry with the configured limits.
func NewRegistry(maxChannels, maxSubsPerChannel, sendBuf int) *Registry {
	return &Registry{
		channels:    make(map[string]*Channel),
		maxChannels: maxChannels,
		maxSubs:     maxSubsPerChannel,
		sendBuf:     sendBuf,
	}
}

// GetOrCreate returns the existing channel for id, creating one if necessary.
// Returns ErrChannelLimit if creating a new channel would exceed the cap.
// Returns ErrBadChannelID if id doesn't validate.
func (r *Registry) GetOrCreate(id string) (*Channel, error) {
	if err := ValidateChannelID(id); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if ch, ok := r.channels[id]; ok {
		return ch, nil
	}
	if len(r.channels) >= r.maxChannels {
		return nil, ErrChannelLimit
	}
	ch := NewChannel(id, r.maxSubs, r.sendBuf)
	r.channels[id] = ch
	return ch, nil
}

// Snapshot returns a copy of all current channel stats for the metrics endpoint.
func (r *Registry) Snapshot() map[string]Stats {
	r.mu.Lock()
	out := make(map[string]Stats, len(r.channels))
	chans := make([]*Channel, 0, len(r.channels))
	for _, c := range r.channels {
		chans = append(chans, c)
	}
	r.mu.Unlock()
	for _, c := range chans {
		out[c.ID()] = c.Stats()
	}
	return out
}

// Reap removes idle channels (no publisher AND no subscribers). Intended to be
// run periodically; channels are cheap so this is housekeeping, not critical.
func (r *Registry) Reap() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, ch := range r.channels {
		s := ch.Stats()
		if !s.HasPublisher && s.Subscribers == 0 {
			delete(r.channels, id)
		}
	}
}
