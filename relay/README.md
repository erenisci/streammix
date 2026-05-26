# relay

WebSocket fan-out server — relays audio packets from the streamer to every extension subscribing to that channel.

**Language:** Go 1.22+
**Protocol:** [../docs/AUDIO_PROTOCOL.md](../docs/AUDIO_PROTOCOL.md)

## Build & Run

```bash
cd relay
go build ./cmd/relay
./relay secret > /tmp/streammix.secret    # one-time: generate HMAC secret
cp config.example.yaml config.yaml         # then paste the secret into auth.token_secret
./relay --config config.yaml
```

Mint a publisher token for a channel:

```bash
./relay token --channel twitch:streamer_name --ttl 365d --config config.yaml
```

## Endpoints

| Path | Auth | Purpose |
|---|---|---|
| `GET /publish?channel=<id>&token=<tok>` | HMAC bearer token | WebSocket upgrade for the streamer |
| `GET /subscribe?channel=<id>` | none | WebSocket upgrade for every viewer |
| `GET /health` | none | Liveness probe |
| `GET :9090/metrics` | none | Prometheus-friendly metrics (separate port) |

## Design Invariants

- **Opaque bridge.** The relay never parses payloads. It sniffs the four magic bytes for sanity, then byte-for-byte broadcasts to subscribers.
- **One publisher per channel.** Second claim returns 409.
- **Bounded everywhere.** `max_channels`, `max_subscribers_per_channel`, `max_frame_bytes` are all enforced. Slow subscribers drop their own oldest packets — never block the publisher loop.
- **Constant-time token comparison.** `crypto/hmac.Equal` for both the channel-match and the MAC check.

## Self-host

[../docs/RELAY_SELFHOST.md](../docs/RELAY_SELFHOST.md)
