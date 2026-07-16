/**
 * Web Audio routing graph for the mixer + active cancellation.
 *
 * Pipeline:
 *
 *   side-channel(t) ─► entry(t) ─┬─► userGain(t) ──────────────► master
 *                                 │                                ▲
 *                                 └─► cancellationSum              │
 *                                            │                     │
 *                                            ▼                     │
 *                                     sharedDelay ─► invert(-1) ───┤
 *                                                                  │
 *   player <video> ─► broadcastTap ─► broadcastGain ───────────────┘
 *                                                                  │
 *                                                                  ▼
 *                                                          AudioDestination
 *
 * master sums the broadcast with an inverted copy of the side-channels — an
 * effective subtraction, i.e. cancellation.
 *
 * All tracks share ONE delay: they were mixed into the same broadcast, so they
 * share its latency (see docs/AUDIO_PROTOCOL.md). Summing first and delaying
 * once is equivalent to delaying each track (the operations are linear) and
 * costs one delay buffer instead of one per track — which matters because that
 * buffer must span whole seconds of broadcast latency.
 *
 * Per-track mute zeroes only the userGain copy; the cancellation tap reads the
 * entry node directly, so cancellation continues and the track fully disappears.
 */

export interface MixerGraph {
  ctx: AudioContext;
  master: GainNode;
  broadcastGain: GainNode;
  cancellationSum: GainNode;
  sharedDelay: DelayNode;
  inverter: GainNode;
  source: MediaElementAudioSourceNode;
  offsetMs: number;
  tracks: Map<string, TrackNodes>;
}

interface TrackNodes {
  entry: GainNode;
  userGain: GainNode;
}

/**
 * How far the side-channels can be delayed to meet the broadcast.
 *
 * The side-channel reaches the viewer in ~100ms (publisher → relay → browser),
 * while the broadcast crawls through ingest, transcode, CDN and the player's own
 * buffer: roughly 3–5s on Twitch low-latency and 10–30s otherwise. Cancellation
 * therefore needs to hold the side-channel back by the WHOLE broadcast latency,
 * so this ceiling has to clear a normal stream — at 2s it could not, and no
 * slider position would line the two up.
 *
 * Cost: one delay buffer of maxDelayTime × 48kHz × 2ch × 4B ≈ 11.5 MB at 30s.
 * Affordable only because the delay is shared across tracks rather than per-track.
 */
const MAX_OFFSET_SECONDS = 30;

export function buildGraph(video: HTMLVideoElement): MixerGraph {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const source = ctx.createMediaElementSource(video);

  const broadcastGain = ctx.createGain();
  broadcastGain.gain.value = 1;

  const cancellationSum = ctx.createGain();
  cancellationSum.gain.value = 1; // inverter carries the sign

  const sharedDelay = ctx.createDelay(MAX_OFFSET_SECONDS);
  sharedDelay.delayTime.value = 0;

  const inverter = ctx.createGain();
  inverter.gain.value = -1;

  const master = ctx.createGain();
  master.gain.value = 1;

  source.connect(broadcastGain);
  broadcastGain.connect(master);
  cancellationSum.connect(sharedDelay);
  sharedDelay.connect(inverter);
  inverter.connect(master);
  master.connect(ctx.destination);

  return {
    ctx,
    master,
    broadcastGain,
    cancellationSum,
    sharedDelay,
    inverter,
    source,
    offsetMs: 0,
    tracks: new Map(),
  };
}

/**
 * Provision per-track plumbing and return the entry node a decoder should
 * connect into. Idempotent: returns the existing entry node if the slug is
 * already known.
 */
export function addTrack(graph: MixerGraph, slug: string): GainNode {
  const existing = graph.tracks.get(slug);
  if (existing) return existing.entry;

  const entry = graph.ctx.createGain();
  entry.gain.value = 1;

  const userGain = graph.ctx.createGain();
  userGain.gain.value = 0.5;
  entry.connect(userGain);
  userGain.connect(graph.master);

  // Cancellation tap: raw, pre-gain, so muting never weakens cancellation.
  // The shared delay and inverter live downstream of cancellationSum.
  entry.connect(graph.cancellationSum);

  graph.tracks.set(slug, { entry, userGain });
  return entry;
}

export function removeTrack(graph: MixerGraph, slug: string): void {
  const t = graph.tracks.get(slug);
  if (!t) return;
  for (const n of [t.entry, t.userGain]) {
    try { n.disconnect(); } catch { /* already disconnected */ }
  }
  graph.tracks.delete(slug);
}

export function entryNodeFor(graph: MixerGraph, slug: string): GainNode | null {
  return graph.tracks.get(slug)?.entry ?? null;
}

export function setTrackGain(graph: MixerGraph, slug: string, value: number): void {
  const t = graph.tracks.get(slug);
  if (!t) return;
  t.userGain.gain.value = clamp01(value);
}

export function setBroadcastGain(graph: MixerGraph, value: number): void {
  graph.broadcastGain.gain.value = clamp01(value);
}

export const MAX_OFFSET_MS = MAX_OFFSET_SECONDS * 1000;

export function setOffsetMs(graph: MixerGraph, ms: number): void {
  const clamped = Number.isFinite(ms) ? Math.max(0, Math.min(MAX_OFFSET_MS, ms)) : 0;
  graph.offsetMs = clamped;
  graph.sharedDelay.delayTime.value = clamped / 1000;
}

export function destroy(graph: MixerGraph): void {
  try { graph.source.disconnect(); } catch { /* ignore */ }
  try { void graph.ctx.close(); } catch { /* ignore */ }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
