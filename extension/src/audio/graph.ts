/**
 * Web Audio routing graph for the mixer + active cancellation.
 *
 * Pipeline (per track t):
 *
 *   side-channel(t) ─► entry(t) ─┬─► delay(common) ─► invert(-1) ─┐
 *                                 │                                 │
 *                                 └─► userGain(t) ─► master         │
 *                                                                   │
 *   player <video> ─► broadcastTap ─► broadcastGain ─► master       ▼
 *                                                       ▲      cancellationSum
 *                                                       │           │
 *                                                       └───────────┘
 *                                                       (master sums
 *                                                       broadcast +
 *                                                       inverted side-channel
 *                                                       → effective subtract)
 *                                                              │
 *                                                              ▼
 *                                                       AudioDestination
 *
 * cancellationSum collects inverted-and-delayed copies of every track. master
 * sums it with broadcastGain — Web Audio's destination sees broadcast minus
 * the side-channel content, i.e. cancellation.
 *
 * Per-track mute zeroes only the userGain copy; cancellation continues, so the
 * track's audio fully disappears.
 */

export interface MixerGraph {
  ctx: AudioContext;
  master: GainNode;
  broadcastGain: GainNode;
  cancellationSum: GainNode;
  source: MediaElementAudioSourceNode;
  offsetMs: number;
  tracks: Map<string, TrackNodes>;
}

interface TrackNodes {
  entry: GainNode;
  userGain: GainNode;
  delay: DelayNode;
  inverter: GainNode;
}

const MAX_OFFSET_SECONDS = 2;

export function buildGraph(video: HTMLVideoElement): MixerGraph {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const source = ctx.createMediaElementSource(video);

  const broadcastGain = ctx.createGain();
  broadcastGain.gain.value = 1;

  const cancellationSum = ctx.createGain();
  cancellationSum.gain.value = 1; // inverters carry the sign

  const master = ctx.createGain();
  master.gain.value = 1;

  source.connect(broadcastGain);
  broadcastGain.connect(master);
  cancellationSum.connect(master);
  master.connect(ctx.destination);

  return {
    ctx,
    master,
    broadcastGain,
    cancellationSum,
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

  const delay = graph.ctx.createDelay(MAX_OFFSET_SECONDS);
  delay.delayTime.value = graph.offsetMs / 1000;
  const inverter = graph.ctx.createGain();
  inverter.gain.value = -1;
  entry.connect(delay);
  delay.connect(inverter);
  inverter.connect(graph.cancellationSum);

  graph.tracks.set(slug, { entry, userGain, delay, inverter });
  return entry;
}

export function removeTrack(graph: MixerGraph, slug: string): void {
  const t = graph.tracks.get(slug);
  if (!t) return;
  for (const n of [t.entry, t.userGain, t.delay, t.inverter]) {
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

export function setOffsetMs(graph: MixerGraph, ms: number): void {
  const clamped = Math.max(0, Math.min(MAX_OFFSET_SECONDS * 1000, ms));
  graph.offsetMs = clamped;
  for (const t of graph.tracks.values()) {
    t.delay.delayTime.value = clamped / 1000;
  }
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
