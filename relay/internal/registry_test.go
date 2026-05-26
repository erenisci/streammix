package internal

import "testing"

func TestValidateChannelID(t *testing.T) {
	good := []string{"twitch:foo", "kick:bar_baz", "twitch:" + string(make([]byte, 0))}
	bad := []string{"", "Twitch:foo", "foo:bar", "twitch:UPPER", "twitch:has space", "twitch:" + repeat("a", 65)}
	for _, s := range good {
		// Empty name not allowed by the regex
		if s == "twitch:" {
			if ValidateChannelID(s) == nil {
				t.Errorf("expected invalid: %q", s)
			}
			continue
		}
		if err := ValidateChannelID(s); err != nil {
			t.Errorf("expected valid %q: %v", s, err)
		}
	}
	for _, s := range bad {
		if err := ValidateChannelID(s); err == nil {
			t.Errorf("expected invalid: %q", s)
		}
	}
}

func TestRegistryChannelLimit(t *testing.T) {
	r := NewRegistry(2, 10, 8)
	_, err := r.GetOrCreate("twitch:a")
	if err != nil {
		t.Fatal(err)
	}
	_, err = r.GetOrCreate("twitch:b")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetOrCreate("twitch:c"); err == nil {
		t.Fatal("expected channel limit error")
	}
}

func TestRegistryReap(t *testing.T) {
	r := NewRegistry(10, 10, 8)
	ch, _ := r.GetOrCreate("twitch:a")
	_ = ch
	r.Reap()
	snap := r.Snapshot()
	if len(snap) != 0 {
		t.Fatalf("expected reap to remove idle channel, got %v", snap)
	}
}

func repeat(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}
