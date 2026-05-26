package internal

import (
	"bytes"
	"sync"
	"testing"
	"time"
)

func TestChannelClaimReleasePublisher(t *testing.T) {
	c := NewChannel("twitch:alice", 100, 16)
	if err := c.ClaimPublisher(); err != nil {
		t.Fatal(err)
	}
	if err := c.ClaimPublisher(); err == nil {
		t.Fatal("second claim should fail")
	}
	c.ReleasePublisher()
	if err := c.ClaimPublisher(); err != nil {
		t.Fatal("claim after release should succeed")
	}
}

func TestChannelSubscribeLimit(t *testing.T) {
	c := NewChannel("twitch:alice", 2, 1)
	_, u1, err := c.Subscribe()
	if err != nil {
		t.Fatal(err)
	}
	_, u2, err := c.Subscribe()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.Subscribe(); err == nil {
		t.Fatal("third subscribe should hit limit")
	}
	u1()
	if _, u3, err := c.Subscribe(); err != nil {
		t.Fatal("subscribe after unsub should succeed")
	} else {
		u3()
	}
	u2()
}

func TestBroadcastReachesAllSubscribers(t *testing.T) {
	c := NewChannel("twitch:alice", 100, 16)
	r1, u1, _ := c.Subscribe()
	r2, u2, _ := c.Subscribe()
	defer u1()
	defer u2()

	want := []byte{1, 2, 3, 4, 5}
	c.Broadcast(want)

	got1 := receiveOne(t, r1)
	got2 := receiveOne(t, r2)
	if !bytes.Equal(got1, want) || !bytes.Equal(got2, want) {
		t.Fatalf("got1=%x got2=%x want=%x", got1, got2, want)
	}
}

func TestBroadcastNonBlockingOnSlowSubscriber(t *testing.T) {
	c := NewChannel("twitch:alice", 100, 2)
	_, unsub, _ := c.Subscribe() // never drain
	defer unsub()

	done := make(chan struct{})
	go func() {
		for i := 0; i < 1000; i++ {
			c.Broadcast([]byte{byte(i)})
		}
		close(done)
	}()
	select {
	case <-done:
		// OK: broadcast did not block on the slow subscriber
	case <-time.After(2 * time.Second):
		t.Fatal("broadcast blocked on slow subscriber")
	}
}

func TestUnsubscribeIsIdempotent(t *testing.T) {
	c := NewChannel("twitch:alice", 100, 16)
	_, unsub, _ := c.Subscribe()
	unsub()
	unsub() // must not panic
}

func TestConcurrentSubscribers(t *testing.T) {
	c := NewChannel("twitch:alice", 1000, 16)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, unsub, err := c.Subscribe()
			if err != nil {
				t.Errorf("subscribe: %v", err)
				return
			}
			defer unsub()
			time.Sleep(10 * time.Millisecond)
		}()
	}
	wg.Wait()
}

func receiveOne(t *testing.T, ch <-chan []byte) []byte {
	t.Helper()
	select {
	case msg := <-ch:
		return msg
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for packet")
		return nil
	}
}
