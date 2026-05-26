/**
 * Mock publisher. Connects to the relay as a publisher and emits a
 * realistic-shaped stream: HELLO → TRACK_LIST → continuous AUDIO_OPUS frames
 * (with synthetic payload) and periodic FINGERPRINT messages.
 *
 * The relay must be running and the token must be valid for the chosen
 * channel. Use the relay's CLI to mint one:
 *
 *   cd relay
 *   ./relay token --channel twitch:dev --ttl 24h --config config.yaml
 *
 * Then:
 *
 *   cd tools/mock-publisher
 *   pnpm install
 *   pnpm start -- --url ws://localhost:8080 --channel twitch:dev --token <TOKEN>
 */

import { WebSocket } from "ws";
import {
  CONTROL_TRACK,
  HEADER_BYTES,
  MessageType,
  SUBPROTOCOL,
  encodeFingerprint,
  encodeFrame,
  encodeHello,
  encodeTrackList,
  type Frame,
} from "@streammix/shared";

interface Args {
  url: string;
  channel: string;
  token: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === "--url") out.url = val;
    else if (key === "--channel") out.channel = val;
    else if (key === "--token") out.token = val;
    else continue;
    i++;
  }
  if (!out.url || !out.channel || !out.token) {
    console.error("usage: --url ws://host --channel twitch:foo --token <TOKEN>");
    process.exit(2);
  }
  return out as Args;
}

const args = parseArgs();
const url = `${args.url}/publish?channel=${encodeURIComponent(args.channel)}&token=${encodeURIComponent(args.token)}`;
const ws = new WebSocket(url, [SUBPROTOCOL]);

const TRACKS = [
  { id: 1, slug: "mic", category: "mic" as const, label: "Microphone" },
  { id: 2, slug: "game", category: "game" as const, label: "Game" },
  { id: 3, slug: "music", category: "music" as const, label: "Spotify" },
];

let seq: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
let timer: NodeJS.Timeout | null = null;
let fpTimer: NodeJS.Timeout | null = null;

function send(frame: Omit<Frame, "flags"> & { flags?: number }): void {
  const f: Frame = { flags: 0, ...frame } as Frame;
  ws.send(encodeFrame(f));
}

ws.on("open", () => {
  console.log("connected as publisher");

  send({
    type: MessageType.Hello,
    track: CONTROL_TRACK,
    seq: 0,
    timestampMs: BigInt(Date.now()),
    payload: encodeHello({
      version: 1,
      client: "mock-publisher/0.0.1",
      audio: { codec: "opus", sampleRate: 48000, channels: 2, frameMs: 20 },
    }),
  });

  send({
    type: MessageType.TrackList,
    track: CONTROL_TRACK,
    seq: 1,
    timestampMs: BigInt(Date.now()),
    payload: encodeTrackList({ tracks: TRACKS }),
  });

  // 50 fps fake Opus frames per track (just random bytes).
  timer = setInterval(() => {
    const tsNow = BigInt(Date.now());
    for (const t of TRACKS) {
      seq[t.id] = (seq[t.id] ?? 0) + 1;
      const buf = new Uint8Array(64);
      crypto.getRandomValues(buf);
      send({
        type: MessageType.AudioOpus,
        track: t.id,
        seq: seq[t.id]!,
        timestampMs: tsNow,
        payload: buf,
      });
    }
  }, 20);

  // Fingerprint per second per track.
  fpTimer = setInterval(() => {
    const tsNow = BigInt(Date.now());
    for (const t of TRACKS) {
      const hash = BigInt(Math.floor(Math.random() * 2 ** 31)) << 32n | BigInt(Math.floor(Math.random() * 2 ** 31));
      send({
        type: MessageType.Fingerprint,
        track: t.id,
        seq: ++seq[t.id]!,
        timestampMs: tsNow,
        payload: encodeFingerprint({ hash, windowMs: 1000 }),
      });
    }
  }, 1000);
});

ws.on("close", (code, reason) => {
  console.log("closed", code, reason.toString());
  if (timer) clearInterval(timer);
  if (fpTimer) clearInterval(fpTimer);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("error", err.message);
});

process.on("SIGINT", () => {
  ws.close(1000, "shutdown");
});
