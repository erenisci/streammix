package internal

import (
	"errors"
	"sync"
)

// ErrChannelTaken is returned when a publisher tries to claim a channel that
// already has an active publisher.
var ErrChannelTaken = errors.New("channel already has a publisher")

// ErrSubscriberLimit is returned when a channel has reached MaxSubscribers.
var ErrSubscriberLimit = errors.New("subscriber limit reached")

// subscriber is a single viewer's outbound queue.
type subscriber struct {
	send   chan []byte
	closed chan struct{}
	dropped uint64 // packets dropped due to back-pressure
}

// Channel is a single fan-out hub: at most one publisher + many subscribers.
// The hub owns its own goroutine for the publisher → subscribers broadcast
// loop, and does NOT inspect packet bytes (the relay must remain opaque).
type Channel struct {
	id        string
	mu        sync.Mutex
	hasPub    bool
	subs      map[*subscriber]struct{}
	maxSubs   int
	sendBuf   int
}

// NewChannel constructs an empty channel hub.
//
//   maxSubs:  hard cap on simultaneous subscribers.
//   sendBuf:  per-subscriber outbound queue depth. A slow subscriber that
//             can't drain at line rate has its oldest packets dropped — never
//             the publisher's broadcast loop blocked.
func NewChannel(id string, maxSubs, sendBuf int) *Channel {
	return &Channel{
		id:      id,
		subs:    make(map[*subscriber]struct{}),
		maxSubs: maxSubs,
		sendBuf: sendBuf,
	}
}

// ID returns the channel identifier (e.g. "twitch:streamer_name").
func (c *Channel) ID() string { return c.id }

// ClaimPublisher returns ErrChannelTaken if there's already an active
// publisher; otherwise marks this channel as having one until ReleasePublisher
// is called. Callers must call ReleasePublisher on disconnect, in defer.
func (c *Channel) ClaimPublisher() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.hasPub {
		return ErrChannelTaken
	}
	c.hasPub = true
	return nil
}

// ReleasePublisher clears the publisher slot. Safe to call even if not held.
func (c *Channel) ReleasePublisher() {
	c.mu.Lock()
	c.hasPub = false
	c.mu.Unlock()
}

// Subscribe registers a new subscriber. The returned channels are:
//   send:   inbound packets to forward to the websocket; closed when the
//           subscriber is removed
//   unsub:  call to remove this subscriber
//
// Slow subscribers do not block the publisher: when send is full the OLDEST
// packet is discarded (consistent with audio-stream "skip stale" semantics).
func (c *Channel) Subscribe() (recv <-chan []byte, unsub func(), err error) {
	c.mu.Lock()
	if len(c.subs) >= c.maxSubs {
		c.mu.Unlock()
		return nil, nil, ErrSubscriberLimit
	}
	s := &subscriber{
		send:   make(chan []byte, c.sendBuf),
		closed: make(chan struct{}),
	}
	c.subs[s] = struct{}{}
	c.mu.Unlock()

	return s.send, func() {
		c.mu.Lock()
		if _, ok := c.subs[s]; ok {
			delete(c.subs, s)
			close(s.send)
		}
		c.mu.Unlock()
	}, nil
}

// Broadcast pushes a single packet to every subscriber. Non-blocking on each
// subscriber: if a subscriber's queue is full, the head packet is dropped and
// the new one queued. The relay never inspects msg — it's opaque.
func (c *Channel) Broadcast(msg []byte) {
	c.mu.Lock()
	subs := make([]*subscriber, 0, len(c.subs))
	for s := range c.subs {
		subs = append(subs, s)
	}
	c.mu.Unlock()

	for _, s := range subs {
		select {
		case s.send <- msg:
			// queued
		default:
			// Subscriber is behind. Drop the oldest, push the new.
			select {
			case <-s.send:
				s.dropped++
			default:
			}
			select {
			case s.send <- msg:
			default:
				// Still couldn't queue — drop entirely.
				s.dropped++
			}
		}
	}
}

// Stats is a snapshot for the metrics endpoint.
type Stats struct {
	HasPublisher bool
	Subscribers  int
}

// Stats returns a current snapshot. Safe to call concurrently.
func (c *Channel) Stats() Stats {
	c.mu.Lock()
	defer c.mu.Unlock()
	return Stats{HasPublisher: c.hasPub, Subscribers: len(c.subs)}
}
