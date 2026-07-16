# Relay Self-Host

Guide for running your own relay. **There is no official hosted relay yet** — until one exists, self-hosting is the only way to run StreamMix, and both the publisher and every viewer must point at the same URL. Other reasons to self-host: privacy, control, bandwidth.

For a turnkey stack (Docker Compose + automatic TLS, free to run), see [`deploy/`](../deploy/README.md).

## Requirements

- Linux server (Ubuntu 22.04+ recommended)
- Public IP or domain
- TLS certificate (Let's Encrypt recommended)
- Sufficient upload bandwidth — `64 kbps × concurrent_viewer_count`

## Quick Start (Docker Compose + automatic TLS)

The maintained path is [`deploy/`](../deploy/README.md): a Compose stack running the
relay behind Caddy, which obtains and renews a Let's Encrypt certificate for you.
It runs free forever on an Oracle Cloud Always Free VM with a DuckDNS subdomain.

```bash
git clone https://github.com/erenisci/streammix.git
cd streammix/deploy
# then follow deploy/README.md
```

> The relay is configured **only** through its YAML file — there are no
> environment-variable overrides. `auth.token_secret` must therefore be mounted at
> runtime, never baked into an image or committed.

## Manual Build

```bash
git clone https://github.com/erenisci/streammix.git
cd streammix/relay
go build -o relay ./cmd/relay
./relay secret                    # generate an HMAC secret for config.yaml
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
  max_frame_bytes: 5120 # 21-byte header + 4 KiB payload cap + slack
  subscriber_send_buffer: 64
auth:
  token_secret: '...' # from `./relay secret`; verifies publisher tokens
metrics:
  enabled: true
  listen: ':9090'
```

## Publisher Token Generation

```bash
./relay token --channel "twitch:streamer_name" --ttl 8760h
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

Streamer (the publisher CLI — see [`publisher/README.md`](../publisher/README.md)):

```powershell
streammix_publisher.exe --relay wss://your-server.com --channel twitch:your_channel --token <token> ...
```

Viewer (in the extension): Settings → "Custom Relay URL" → `wss://your-server.com`

> A viewer pointing at a custom relay will only see streams broadcasting through that relay. To make this obvious, the extension shows a warning before the user changes the relay setting.

## Monitoring

Prometheus-flavoured metrics on `:9090/metrics`:

- `relay_active_channels`
- `relay_active_subscribers`
- `relay_packets_relayed_total`
- `relay_bytes_relayed_total`
- `relay_publisher_auth_failures_total`
- `relay_publisher_auth_blocked_total` — count of 429s from the per-IP failed-auth limiter (default 5 failures in 60s triggers a 5-minute cooldown)
- `relay_uptime_seconds`

## Reverse Proxy Caveats

If you sit the relay behind a reverse proxy (nginx, Caddy, Cloudflare), make sure the proxy is the only thing setting `X-Forwarded-For`. The publisher auth rate limiter trusts the leftmost XFF entry to identify the source IP; if clients can inject that header directly they bypass the limiter.

This is not theoretical: Caddy's `reverse_proxy` **appends** to a client-supplied `X-Forwarded-For` by default, which leaves the leftmost entry attacker-controlled. Overwrite it with the real peer address:

```caddyfile
reverse_proxy relay:8080 {
    header_up X-Forwarded-For {remote_host}
}
```

The nginx equivalent is `proxy_set_header X-Forwarded-For $remote_addr;` (note: `$proxy_add_x_forwarded_for` would append and is unsafe here). [`deploy/Caddyfile`](../deploy/Caddyfile) already does this.

For the same reason: avoid logging publisher query strings in proxy access logs — the publisher token rides in `?token=...`. Configure your proxy to redact or omit query strings for `/publish` requests. [`deploy/Caddyfile`](../deploy/Caddyfile) ships a `format filter` that replaces the `token` query parameter with `REDACTED`.

## Capacity Planning

- 1 vCPU + 1 GB RAM → ~500 concurrent subscribers
- Bandwidth is the bottleneck, not CPU
- For multi-region: set up DNS-based geo-routing (Cloudflare Load Balancer or similar)
