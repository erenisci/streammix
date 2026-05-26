# tools/

Helper utilities for local development and end-to-end testing.

## mock-publisher

Talks to the relay's `/publish` endpoint as if it were the OBS plugin. Emits a HELLO, a TRACK_LIST with three tracks (mic, game, music), then continuous 20-ms Opus-shaped frames + per-second fingerprints.

```bash
cd tools/mock-publisher
npm install
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev --token <TOKEN>
```

## mock-subscriber

Joins the relay's `/subscribe` endpoint, decodes every frame using `@streammix/shared`, and either prints a per-message line (`--verbose`) or a periodic per-type summary.

```bash
cd tools/mock-subscriber
npm install
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev
```

## End-to-end smoke test (Phase 5 checkpoint)

In three terminals:

```bash
# 1. Relay
cd relay
go build ./cmd/relay
./relay secret > /tmp/secret      # paste into config.yaml auth.token_secret
./relay --config config.yaml

# 2. Mock publisher
TOKEN=$(cd relay && ./relay token --channel twitch:dev --ttl 1h --config config.yaml)
cd tools/mock-publisher
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev --token "$TOKEN"

# 3. Mock subscriber
cd tools/mock-subscriber
node --import tsx src/main.ts --url ws://localhost:8080 --channel twitch:dev
```

The subscriber should print `track list: 1:mic, 2:game, 3:music` and a steadily growing `counts` map (AudioOpus dominating, ~50 fps × 3 tracks per second).
