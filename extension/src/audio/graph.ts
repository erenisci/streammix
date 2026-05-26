/**
 * Web Audio routing graph for the mixer.
 *
 * Goal: tap the platform player's audio, optionally subtract each side-channel
 * (cancellation), then re-mix everything through user-controlled gain nodes.
 *
 *                        ┌──────── delay ─────► invert ──┐
 *   player <video> ──► tap                                ├─► sum ──► broadcast gain ──┐
 *                        └──────────────────────────────►(through)                     │
 *                                                                                       ├─► dest
 *                       ┌── track1 decoded ──► gain1 ─────────────────────────────────┤
 *                       ├── track2 decoded ──► gain2 ─────────────────────────────────┤
 *                       └── ... per-track sliders ────────────────────────────────────┘
 *
 * For Phase 3 we wire up the *graph topology* (gains, delays, output) but the
 * cancellation summing and Opus decode happen as follow-on work. The mock
 * relay client feeds dummy data so the UI can be exercised end-to-end against
 * an empty cancellation lane.
 */

export interface MixerGraph {
  ctx: AudioContext;
  /** Master output gain — gets multiplied by every track. */
  master: GainNode;
  /** Broadcast residual (post-cancellation) gain. */
  broadcastGain: GainNode;
  /** Per-track gains keyed by slug. Add/remove as TRACK_LIST changes. */
  trackGains: Map<string, GainNode>;
  /** Common delay node so we can align side-channels with the broadcast. */
  delayNode: DelayNode;
  /** The MediaElementSource we tapped — kept alive for the lifetime of the graph. */
  source: MediaElementAudioSourceNode;
}

/** Build the initial mixer graph anchored to a player <video> element. */
export function buildGraph(video: HTMLVideoElement): MixerGraph {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const source = ctx.createMediaElementSource(video);

  const broadcastGain = ctx.createGain();
  broadcastGain.gain.value = 1;

  const master = ctx.createGain();
  master.gain.value = 1;

  // Player → broadcastGain → master → destination
  source.connect(broadcastGain);
  broadcastGain.connect(master);
  master.connect(ctx.destination);

  // Delay node for side-channel alignment (max 2 seconds).
  const delayNode = ctx.createDelay(2);
  delayNode.delayTime.value = 0;

  return {
    ctx,
    master,
    broadcastGain,
    trackGains: new Map(),
    delayNode,
    source,
  };
}

/** Add a per-track gain node and connect it through the master. */
export function addTrack(graph: MixerGraph, slug: string): GainNode {
  if (graph.trackGains.has(slug)) return graph.trackGains.get(slug)!;
  const g = graph.ctx.createGain();
  g.gain.value = 0.5;
  g.connect(graph.master);
  graph.trackGains.set(slug, g);
  return g;
}

/** Remove a per-track gain (e.g. when the streamer drops the channel). */
export function removeTrack(graph: MixerGraph, slug: string): void {
  const g = graph.trackGains.get(slug);
  if (!g) return;
  g.disconnect();
  graph.trackGains.delete(slug);
}

/** Set a track's gain (0..1). Out-of-range values are clamped. */
export function setTrackGain(graph: MixerGraph, slug: string, value: number): void {
  const g = graph.trackGains.get(slug);
  if (!g) return;
  g.gain.value = clamp01(value);
}

/** Set the broadcast residual gain (0..1). */
export function setBroadcastGain(graph: MixerGraph, value: number): void {
  graph.broadcastGain.gain.value = clamp01(value);
}

/** Set the side-channel ↔ broadcast offset in milliseconds (0..2000). */
export function setOffsetMs(graph: MixerGraph, ms: number): void {
  graph.delayNode.delayTime.value = Math.max(0, Math.min(2, ms / 1000));
}

/** Tear down the graph (e.g. on SPA navigation away from a channel). */
export function destroy(graph: MixerGraph): void {
  try {
    graph.source.disconnect();
  } catch {
    /* already disconnected */
  }
  try {
    void graph.ctx.close();
  } catch {
    /* already closed */
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
