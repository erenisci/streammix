/**
 * Content script entry point. Runs on every Twitch/Kick page.
 *
 * Phase 3 scope: detect the current channel, find the player, mount the
 * mixer panel as an overlay (no DOM injection into the platform's React
 * tree). Subscribe to the relay; when TRACK_LIST arrives, render sliders.
 *
 * Cancellation audio routing is wired (graph topology only); decoded Opus →
 * cancellation lane summing is Phase 5 work.
 */

import type { TrackInfo } from "@streammix/shared";
import { detectChannel } from "../platform/detect.js";
import { waitForPlayer } from "../platform/player.js";
import {
  addTrack,
  buildGraph,
  destroy,
  removeTrack,
  setBroadcastGain,
  setTrackGain,
  type MixerGraph,
} from "../audio/graph.js";
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

interface State {
  channelID: string;
  graph: MixerGraph;
  relay: RelayClient;
  tracks: TrackInfo[];
  /** Per-track effective setting; lives in memory, persisted on Save click. */
  settings: Map<string, ChannelSetting>;
  broadcastGain: number;
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

  const settings = new Map<string, ChannelSetting>();

  const panel = document.createElement("div");
  panel.id = "streammix-mixer-root";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "80px",
    right: "16px",
    zIndex: "99999",
  });
  document.body.appendChild(panel);

  // Mock TRACK_LIST handler & UI props — Svelte will re-render via assignment.
  let tracks: TrackInfo[] = [];
  let gains: Record<string, number> = {};
  let muted: Record<string, boolean> = {};
  let broadcastGain = 0.2;
  setBroadcastGain(graph, broadcastGain);

  const mixer = new Mixer({
    target: panel,
    props: {
      tracks,
      gains,
      muted,
      broadcastGain,
      onChange: (slug: string, v: number) => {
        gains[slug] = v;
        const s = settings.get(slug);
        if (s) {
          s.gain = v;
          settings.set(slug, s);
        }
        setTrackGain(graph, slug, muted[slug] ? 0 : v);
        mixer.$set({ gains });
      },
      onMuteToggle: (slug: string) => {
        muted[slug] = !muted[slug];
        const s = settings.get(slug);
        if (s) s.muted = muted[slug]!;
        setTrackGain(graph, slug, muted[slug] ? 0 : (gains[slug] ?? 0.5));
        mixer.$set({ muted });
      },
      onSoloToggle: (slug: string) => {
        for (const t of tracks) {
          muted[t.slug] = t.slug !== slug;
          setTrackGain(graph, t.slug, muted[t.slug] ? 0 : (gains[t.slug] ?? 0.5));
        }
        mixer.$set({ muted });
      },
      onBroadcastChange: (v: number) => {
        broadcastGain = v;
        setBroadcastGain(graph, v);
        mixer.$set({ broadcastGain });
      },
      onReset: () => {
        for (const t of tracks) {
          const eff = effectiveSetting(t.slug, t.category, {}, globalPrefs);
          gains[t.slug] = eff.gain;
          muted[t.slug] = eff.muted;
          settings.set(t.slug, { ...eff });
          setTrackGain(graph, t.slug, eff.muted ? 0 : eff.gain);
        }
        mixer.$set({ gains, muted });
      },
      onSaveStreamer: () => {
        const out: Record<string, ChannelSetting> = {};
        for (const [slug, s] of settings) out[slug] = s;
        void saveStreamer(loc.channelID, out);
      },
    },
  });

  const applyTrackList = (incoming: TrackInfo[]): void => {
    // Diff: add new, drop missing.
    const incomingSlugs = new Set(incoming.map((t) => t.slug));
    for (const t of tracks) {
      if (!incomingSlugs.has(t.slug)) {
        removeTrack(graph, t.slug);
        delete gains[t.slug];
        delete muted[t.slug];
        settings.delete(t.slug);
      }
    }
    for (const t of incoming) {
      if (!settings.has(t.slug)) {
        const eff = effectiveSetting(t.slug, t.category, streamerPrefs, globalPrefs);
        settings.set(t.slug, { ...eff });
        gains[t.slug] = eff.gain;
        muted[t.slug] = eff.muted;
        addTrack(graph, t.slug);
        setTrackGain(graph, t.slug, eff.muted ? 0 : eff.gain);
      }
    }
    tracks = incoming;
    mixer.$set({ tracks, gains, muted });
  };

  const relay = connect(DEFAULT_RELAY_URL, loc.channelID, {
    onTrackList: applyTrackList,
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
    broadcastGain,
    panel,
    mixer,
    destroy() {
      relay.close();
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

// SPA navigation: Twitch and Kick swap channels without a full reload. Watch
// for URL changes and re-mount.
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
