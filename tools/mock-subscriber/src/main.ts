/**
 * Mock subscriber. Connects to the relay's /subscribe endpoint, decodes every
 * frame using the shared codec, and prints a summary line per message. Used
 * for relay smoke tests without bringing up a real browser extension.
 *
 *   pnpm install
 *   pnpm start -- --url ws://localhost:8080 --channel twitch:dev
 */

import { WebSocket } from "ws";
import {
  decodeError,
  decodeFingerprint,
  decodeFrame,
  decodeTrackList,
  MessageType,
  SUBPROTOCOL,
} from "@streammix/shared";

interface Args {
  url: string;
  channel: string;
  summarize?: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Partial<Args> = { summarize: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") out.url = argv[++i];
    else if (argv[i] === "--channel") out.channel = argv[++i];
    else if (argv[i] === "--verbose") out.summarize = false;
  }
  if (!out.url || !out.channel) {
    console.error("usage: --url ws://host --channel twitch:foo [--verbose]");
    process.exit(2);
  }
  return out as Args;
}

const args = parseArgs();
const ws = new WebSocket(
  `${args.url}/subscribe?channel=${encodeURIComponent(args.channel)}`,
  [SUBPROTOCOL],
);

const counts: Record<string, number> = {};

ws.on("open", () => console.log("subscribed"));

ws.on("message", (data: Buffer) => {
  let frame;
  try {
    frame = decodeFrame(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  } catch (e) {
    console.error("decode error", (e as Error).message);
    return;
  }
  const name = MessageType[frame.type] ?? `0x${frame.type.toString(16)}`;
  counts[name] = (counts[name] ?? 0) + 1;
  if (!args.summarize) {
    console.log(name, "track=", frame.track, "seq=", frame.seq, "len=", frame.payload.length);
  }
  if (frame.type === MessageType.TrackList) {
    try {
      const tl = decodeTrackList(frame.payload);
      console.log("track list:", tl.tracks.map((t) => `${t.id}:${t.slug}`).join(", "));
    } catch {/* ignore */}
  } else if (frame.type === MessageType.Fingerprint && args.summarize) {
    try {
      const fp = decodeFingerprint(frame.payload);
      // suppress output when summarizing
      void fp;
    } catch {/* ignore */}
  } else if (frame.type === MessageType.Error) {
    try {
      const err = decodeError(frame.payload);
      console.error("relay error:", err.code, err.message);
    } catch {/* ignore */}
  }
});

ws.on("close", (code, reason) => {
  console.log("closed", code, reason.toString());
  console.log("counts", counts);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("error", err.message);
});

// Print a heartbeat summary every 5 seconds.
const t = setInterval(() => {
  if (args.summarize && Object.keys(counts).length) {
    console.log("counts so far:", counts);
  }
}, 5000);

process.on("SIGINT", () => {
  clearInterval(t);
  ws.close(1000, "shutdown");
});
