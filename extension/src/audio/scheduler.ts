/**
 * Per-track playback scheduler.
 *
 * Each decoded AudioBuffer (20 ms of audio) is queued onto an AudioBufferSource
 * scheduled exactly `frame_duration` after the previous one. A small jitter
 * buffer (one frame) absorbs network/decode variance; if the queue runs dry
 * we silently reset the play cursor on the next arrival.
 *
 * Connecting: each scheduled source connects to the per-track ENTRY node
 * provided by the graph. The graph then fans that into (a) user-mix gain and
 * (b) the inverter+delay cancellation lane.
 */

const FRAME_DURATION = 0.02; // 20 ms in seconds

export interface ScheduledLane {
  enqueue(buf: AudioBuffer): void;
  close(): void;
}

export function createScheduler(
  ctx: AudioContext,
  destination: AudioNode,
): ScheduledLane {
  let playCursor = 0;
  // Track active source nodes so we can disconnect them on close.
  const liveSources: AudioBufferSourceNode[] = [];

  return {
    enqueue(buf) {
      const now = ctx.currentTime;
      // If the cursor has fallen behind real time (initial frame, or queue
      // ran dry and the next packet arrived late), rebase to a small lead-in.
      if (playCursor < now + FRAME_DURATION) {
        playCursor = now + FRAME_DURATION;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(destination);
      src.start(playCursor);
      src.onended = () => {
        try { src.disconnect(); } catch { /* ignore */ }
        const idx = liveSources.indexOf(src);
        if (idx >= 0) liveSources.splice(idx, 1);
      };
      liveSources.push(src);
      playCursor += FRAME_DURATION;
    },
    close() {
      for (const s of liveSources) {
        try { s.stop(); } catch { /* may have already ended */ }
        try { s.disconnect(); } catch { /* ignore */ }
      }
      liveSources.length = 0;
    },
  };
}
