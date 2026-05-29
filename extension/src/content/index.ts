/**
 * Content script entry point. Runs on every Twitch/Kick page.
 *
 * Phase 5b: detect the channel, mount the mixer, subscribe to the relay, and
 * wire each incoming AUDIO_OPUS frame through a per-track Opus decoder +
 * playback scheduler into the cancellation/mix graph. When the user moves a
 * slider the audible change is the streamer-side audio appearing in the
 * mix; muting it both removes the user-mix copy AND keeps the cancellation
 * active, so the track effectively disappears.
 */

import type { Frame, TrackInfo } from "@streammix/shared";
import { detectChannel } from "../platform/detect.js";
import { waitForPlayer } from "../platform/player.js";
import {
  addTrack,
  buildGraph,
  destroy,
  entryNodeFor,
  removeTrack,
  setBroadcastGain,
  setOffsetMs,
  setTrackGain,
  type MixerGraph,
} from "../audio/graph.js";
import { createOpusDecoder, type OpusDecoderLane } from "../audio/decoder.js";
import { createScheduler, type ScheduledLane } from "../audio/scheduler.js";
import { connect, type RelayClient } from "../relay/client.js";
import {
  effectiveSetting,
  loadGlobal,
  loadStreamer,
  saveStreamer,
  type ChannelSetting,
} from "../store/prefs.js";
import Mixer from "../ui/Mixer.svelte";

const DEFAULT_RELAY_URL = "wss://relay.streammix.dev";

interface AudioLane {
  decoder: OpusDecoderLane;
  scheduler: ScheduledLane;
}

interface State {
  channelID: string;
  graph: MixerGraph;
  relay: RelayClient;
  tracks: TrackInfo[];
  settings: Map<string, ChannelSetting>;
  audioLanes: Map<string, AudioLane>;
  broadcastGain: number;
  offsetMs: number;
  panel: HTMLDivElement;
  mixer: Mixer;
  destroy(): void;
}

let active: State | null = null;

async function mount(): Promise<void> {
  const loc = detectChannel();
  if (!loc) return;

  const hooks = await waitForPlayer(loc.platform);
  if (!hooks) return;

  const graph = buildGraph(hooks.video);
  const [globalPrefs, streamerPrefs] = await Promise.all([
    loadGlobal(),
    loadStreamer(loc.channelID),
  ]);

  // Browser autoplay policies suspend AudioContext until the user interacts
  // with the page. The platform player itself is a user gesture once playing,
  // but we additionally resume on any future user click.
  const resumeAudio = (): void => {
    if (graph.ctx.state === "suspended") void graph.ctx.resume();
  };
  document.addEventListener("click", resumeAudio, { capture: true });
  hooks.video.addEventListener("play", resumeAudio);

  const settings = new Map<string, ChannelSetting>();
  const audioLanes = new Map<string, AudioLane>();

  const panel = document.createElement("div");
  panel.id = "streammix-mixer-root";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "80px",
    right: "16px",
    zIndex: "99999",
  });
  document.body.appendChild(panel);

  let tracks: TrackInfo[] = [];
  let gains: Record<string, number> = {};
  let muted: Record<string, boolean> = {};
  let broadcastGain = 0.2;
  let offsetMs = 0;
  setBroadcastGain(graph, broadcastGain);
  setOffsetMs(graph, offsetMs);

  const mixer = new Mixer({
    target: panel,
    props: {
      tracks,
      gains,
      muted,
      broadcastGain,
      offsetMs,
      onChange: (slug: string, v: number) => {
        gains = { ...gains, [slug]: v };
        const s = settings.get(slug);
        if (s) {
          s.gain = v;
          settings.set(slug, s);
        }
        setTrackGain(graph, slug, muted[slug] ? 0 : v);
        mixer.$set({ gains });
      },
      onMuteToggle: (slug: string) => {
        const next = !muted[slug];
        muted = { ...muted, [slug]: next };
        const s = settings.get(slug);
        if (s) s.muted = next;
        setTrackGain(graph, slug, next ? 0 : (gains[slug] ?? 0.5));
        mixer.$set({ muted });
      },
      onSoloToggle: (slug: string) => {
        const nextMuted: Record<string, boolean> = {};
        for (const t of tracks) {
          nextMuted[t.slug] = t.slug !== slug;
          setTrackGain(graph, t.slug, nextMuted[t.slug] ? 0 : (gains[t.slug] ?? 0.5));
        }
        muted = nextMuted;
        mixer.$set({ muted });
      },
      onBroadcastChange: (v: number) => {
        broadcastGain = v;
        setBroadcastGain(graph, v);
        mixer.$set({ broadcastGain });
      },
      onOffsetChange: (ms: number) => {
        offsetMs = ms;
        setOffsetMs(graph, ms);
        mixer.$set({ offsetMs });
      },
      onReset: () => {
        const nextGains: Record<string, number> = {};
        const nextMuted: Record<string, boolean> = {};
        for (const t of tracks) {
          const eff = effectiveSetting(t.slug, t.category, {}, globalPrefs);
          nextGains[t.slug] = eff.gain;
          nextMuted[t.slug] = eff.muted;
          settings.set(t.slug, { ...eff });
          setTrackGain(graph, t.slug, eff.muted ? 0 : eff.gain);
        }
        gains = nextGains;
        muted = nextMuted;
        mixer.$set({ gains, muted });
      },
      onSaveStreamer: () => {
        const out: Record<string, ChannelSetting> = {};
        for (const [slug, s] of settings) out[slug] = s;
        void saveStreamer(loc.channelID, out);
      },
    },
  });

  const ensureLane = (slug: string): AudioLane | null => {
    const existing = audioLanes.get(slug);
    if (existing) return existing;
    const entry = entryNodeFor(graph, slug);
    if (!entry) return null;
    let scheduler: ScheduledLane;
    let decoder: OpusDecoderLane;
    try {
      scheduler = createScheduler(graph.ctx, entry);
      decoder = createOpusDecoder(graph.ctx, (buf) => scheduler.enqueue(buf));
    } catch (e) {
      console.warn("[StreamMix] decoder unavailable:", (e as Error).message);
      return null;
    }
    const lane: AudioLane = { decoder, scheduler };
    audioLanes.set(slug, lane);
    return lane;
  };

  const applyTrackList = (incoming: TrackInfo[]): void => {
    const incomingSlugs = new Set(incoming.map((t) => t.slug));
    const nextGains = { ...gains };
    const nextMuted = { ...muted };
    for (const t of tracks) {
      if (!incomingSlugs.has(t.slug)) {
        const lane = audioLanes.get(t.slug);
        lane?.decoder.close();
        lane?.scheduler.close();
        audioLanes.delete(t.slug);
        removeTrack(graph, t.slug);
        delete nextGains[t.slug];
        delete nextMuted[t.slug];
        settings.delete(t.slug);
      }
    }
    for (const t of incoming) {
      if (!settings.has(t.slug)) {
        const eff = effectiveSetting(t.slug, t.category, streamerPrefs, globalPrefs);
        settings.set(t.slug, { ...eff });
        nextGains[t.slug] = eff.gain;
        nextMuted[t.slug] = eff.muted;
        addTrack(graph, t.slug);
        setTrackGain(graph, t.slug, eff.muted ? 0 : eff.gain);
        ensureLane(t.slug);
      }
    }
    tracks = incoming;
    gains = nextGains;
    muted = nextMuted;
    mixer.$set({ tracks, gains, muted });
  };

  // Track id (wire byte) → slug. Built whenever TRACK_LIST arrives.
  const idToSlug = new Map<number, string>();
  const indexTracks = (incoming: TrackInfo[]): void => {
    idToSlug.clear();
    for (const t of incoming) idToSlug.set(t.id, t.slug);
  };

  const relay = connect(DEFAULT_RELAY_URL, loc.channelID, {
    onTrackList: (incoming) => {
      indexTracks(incoming);
      applyTrackList(incoming);
    },
    onAudio: (trackID, frame: Frame) => {
      const slug = idToSlug.get(trackID);
      if (!slug) return;
      const lane = ensureLane(slug);
      if (!lane) return;
      lane.decoder.decode(frame.payload, frame.seq);
    },
    onConnect: () => console.debug("[StreamMix] relay connected"),
    onDisconnect: (clean) => console.debug("[StreamMix] relay disconnect", { clean }),
    onError: (code, message) => console.warn("[StreamMix] relay error", code, message),
  });

  active = {
    channelID: loc.channelID,
    graph,
    relay,
    tracks,
    settings,
    audioLanes,
    broadcastGain,
    offsetMs,
    panel,
    mixer,
    destroy() {
      document.removeEventListener("click", resumeAudio, { capture: true });
      hooks.video.removeEventListener("play", resumeAudio);
      relay.close();
      for (const lane of audioLanes.values()) {
        lane.decoder.close();
        lane.scheduler.close();
      }
      audioLanes.clear();
      destroy(graph);
      try {
        mixer.$destroy();
      } catch {
        /* ignore */
      }
      panel.remove();
    },
  };
}

function unmount(): void {
  active?.destroy();
  active = null;
}

let lastHref = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    unmount();
    void mount();
  }
});
observer.observe(document.documentElement, { subtree: true, childList: true });

void mount();
