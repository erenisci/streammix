# Always-on relay deploy

Turnkey deploy for a 7/24 StreamMix relay: the relay container plus [Caddy](https://caddyserver.com/),
which fetches and renews a Let's Encrypt certificate automatically. The public
endpoint ends up as `wss://<your-domain>` — which is what the extension and the
publisher connect to.

**Why TLS is mandatory:** the extension runs on `twitch.tv` / `kick.com`, which are
HTTPS. Browsers block plain `ws://` from an HTTPS page as mixed content, so the
relay must be reachable over `wss://`.

**Why the secret is never in the image:** the relay reads `auth.token_secret` from
its YAML config only. `config.yaml` is mounted at runtime and is gitignored — it
must never be baked into an image or committed. Anyone holding that secret can
mint publisher tokens for any channel.

## Cost

This runs free forever on an [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)
VM (ARM Ampere) plus a free [DuckDNS](https://www.duckdns.org/) subdomain. A
Google Cloud `e2-micro` always-free VM works too. Any VPS with Docker is fine.

## Prerequisites

1. **A VM with a public IP** and Docker + Docker Compose installed.
2. **A domain pointing at that IP.** Free option: register a DuckDNS subdomain and
   set its IP to your VM's public IP.
3. **Ports 80 and 443 open.** On Oracle Cloud this is two steps — most people miss
   the second:
   - VCN → Security List → add ingress rules for TCP 80 and 443 from `0.0.0.0/0`
   - On the VM itself, Oracle images ship with iptables closed:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

## First run

```bash
git clone https://github.com/erenisci/streammix.git
cd streammix/deploy

# 1. Point the deploy at your domain (one line — Caddy gets a cert for it, and
#    this is the host clients reach as wss://<domain>)
echo 'RELAY_DOMAIN=your-name.duckdns.org' > .env

# 2. Build the image, then generate the HMAC secret (signs publisher tokens).
#    Use plain `docker run` here, NOT `docker compose run`: the compose service
#    mounts ./config.yaml, which does not exist yet — Docker would silently
#    create it as an empty *directory* and break the real startup.
docker compose build relay
docker run --rm streammix-relay secret > secret.txt

# 3. Create the live config
cp ../relay/config.example.yaml config.yaml
$EDITOR config.yaml
#   - auth.token_secret: paste the value from secret.txt
#   - tls.cert / tls.key: leave EMPTY — Caddy terminates TLS, the relay speaks
#     plain HTTP on the internal Docker network

# 4. Launch
docker compose up -d
```

Caddy provisions the certificate on first request (allow a few seconds). Verify:

```bash
curl https://your-name.duckdns.org/health     # -> ok
```

If the certificate fails, it is almost always ports 80/443 not actually reachable —
recheck both the cloud firewall and the VM's iptables. Watch with
`docker compose logs -f caddy`.

## Mint a publisher token

One token per channel, signed with the secret from `config.yaml`:

```bash
docker compose exec relay /usr/local/bin/relay token \
  --channel twitch:your_channel --ttl 8760h --config /etc/streammix/config.yaml
```

`--ttl` takes a Go duration, whose largest unit is the hour — `365d` is a parse
error, `8760h` is one year.

## Point the clients at it

- **Publisher (Windows):**
  `streammix_publisher.exe --relay-url wss://your-name.duckdns.org --channel twitch:your_channel --token <token> ...`
- **Extension:** open the popup → custom relay URL → `wss://your-name.duckdns.org`

## Operations

```bash
docker compose logs -f relay        # relay logs
docker compose ps                   # status
docker compose pull && docker compose up -d --build   # update after a git pull
docker compose down                 # stop
```

Metrics are bound to `127.0.0.1:9090` — reachable from the VM, never from the
internet. Read them on the VM with:

```bash
curl localhost:9090/metrics
```

Note the relay image is `distroless/static`: it has no shell and no busybox. Only
`docker compose exec relay /usr/local/bin/relay ...` works (exec invokes the binary
directly); `docker compose exec relay sh` will not.

## Files

| File                 | Committed? | Purpose                                          |
| -------------------- | ---------- | ------------------------------------------------ |
| `docker-compose.yml` | yes        | relay + Caddy services                           |
| `Caddyfile`          | yes        | reverse proxy + automatic HTTPS                  |
| `.env`               | **no**     | `RELAY_DOMAIN=...` — you create it in step 1     |
| `config.yaml`        | **no**     | live relay config — **contains the HMAC secret** |
| `secret.txt`         | **no**     | generated secret                                 |
