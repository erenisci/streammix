# Relay Self-Host

Guide for running your own relay instead of the official `relay.streammix.dev`. Reasons to self-host: privacy, control, or bandwidth.

## Requirements

- Linux server (Ubuntu 22.04+ recommended)
- Public IP or domain
- TLS certificate (Let's Encrypt recommended)
- Sufficient upload bandwidth — `64 kbps × concurrent_viewer_count`

## Quick Start (Docker)

```bash
docker run -d \
  --name streammix-relay \
  -p 443:8080 \
  -e RELAY_TOKEN_SECRET=$(openssl rand -hex 32) \
  -e RELAY_TLS_CERT=/certs/fullchain.pem \
  -e RELAY_TLS_KEY=/certs/privkey.pem \
  -v /etc/letsencrypt/live/yourdomain.com:/certs:ro \
  ghcr.io/<org>/streammix-relay:latest
```

## Manual Build

```bash
git clone https://github.com/<org>/streammix.git
cd streammix/relay
go build -o relay ./cmd/relay
./relay --config config.yaml
```

## Configuration

`config.yaml`:

```yaml
listen: ':8080'
tls:
  cert: '/etc/letsencrypt/live/yourdomain.com/fullchain.pem'
  key: '/etc/letsencrypt/live/yourdomain.com/privkey.pem'
limits:
  max_channels: 1000
  max_subscribers_per_channel: 5000
  max_packet_bytes: 4096
auth:
  token_secret: '...' # for publisher token verification
metrics:
  enabled: true
  listen: ':9090'
```

## Publisher Token Generation

```bash
./relay token --channel "twitch:streamer_name" --ttl 365d
```

The generated token is valid only for that channel.

## systemd Unit

`/etc/systemd/system/streammix-relay.service`:

```ini
[Unit]
Description=StreamMix Relay
After=network.target

[Service]
ExecStart=/usr/local/bin/relay --config /etc/streammix/config.yaml
Restart=always
User=streammix
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now streammix-relay
```

## Streamer / Viewer Settings

Streamer (in OBS plugin):

- `Relay URL`: `wss://your-server.com`
- `Token`: from the command above

Viewer (in the extension): Settings → "Custom Relay URL" → `wss://your-server.com`

> A viewer pointing at a custom relay will only see streams broadcasting through that relay. To make this obvious, the extension shows a warning before the user changes the relay setting.

## Monitoring

Prometheus metrics on `:9090/metrics`:

- `relay_active_channels`
- `relay_active_subscribers`
- `relay_packets_relayed_total`
- `relay_bytes_relayed_total`
- `relay_publisher_auth_failures_total`

## Capacity Planning

- 1 vCPU + 1 GB RAM → ~500 concurrent subscribers
- Bandwidth is the bottleneck, not CPU
- For multi-region: set up DNS-based geo-routing (Cloudflare Load Balancer or similar)
