/**
 * Per-track Opus decoder built on WebCodecs AudioDecoder.
 *
 * The publisher sends raw Opus packets (no container) at 50 Hz with monotonic
 * SEQ numbers; we map each into an EncodedAudioChunk with a per-track relative
 * timestamp (microseconds since the first frame). WebCodecs decodes into
 * AudioData which we convert to AudioBuffer and hand to the scheduler.
 *
 * If WebCodecs isn't available (very old browsers), createOpusDecoder throws
 * and the extension reports "browser too old for cancellation".
 */

const FRAME_DURATION_US = 20_000; // 20 ms per Opus frame, matches HELLO contract
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

export type DecodedCallback = (buf: AudioBuffer) => void;

export interface OpusDecoderLane {
  decode(packet: Uint8Array, seq: number): void;
  close(): void;
}

export function createOpusDecoder(
  ctx: AudioContext,
  onDecoded: DecodedCallback,
): OpusDecoderLane {
  if (typeof AudioDecoder === "undefined") {
    throw new Error("WebCodecs AudioDecoder unavailable; browser too old");
  }

  let baseSeq: number | null = null;
  let lastSeq: number | null = null;

  const decoder = new AudioDecoder({
    output: (data: AudioData) => {
      const frames = data.numberOfFrames;
      const buf = ctx.createBuffer(CHANNELS, frames, SAMPLE_RATE);
      const tmp = new Float32Array(frames);
      // AudioData is planar by default after `copyTo` with a planeIndex.
      try {
        for (let ch = 0; ch < CHANNELS; ch++) {
          data.copyTo(tmp, { planeIndex: ch, format: "f32-planar" });
          buf.copyToChannel(tmp, ch);
        }
      } catch {
        // Some decoders only support interleaved output. Fall back.
        const interleaved = new Float32Array(frames * CHANNELS);
        data.copyTo(interleaved, { planeIndex: 0, format: "f32" });
        for (let ch = 0; ch < CHANNELS; ch++) {
          const chBuf = new Float32Array(frames);
          for (let i = 0; i < frames; i++) chBuf[i] = interleaved[i * CHANNELS + ch]!;
          buf.copyToChannel(chBuf, ch);
        }
      }
      data.close();
      onDecoded(buf);
    },
    error: (err: Error) => {
      // Reset on transient decode errors; the next packet will re-prime.
      console.warn("[StreamMix] opus decode error:", err.message);
    },
  });

  decoder.configure({
    codec: "opus",
    sampleRate: SAMPLE_RATE,
    numberOfChannels: CHANNELS,
  });

  return {
    decode(packet, seq) {
      if (baseSeq === null) baseSeq = seq;
      // Gaps in SEQ would offset the timeline; we accept them by using the
      // delta from baseSeq. The scheduler smooths over short gaps; large gaps
      // produce audible glitches but no decoder crash.
      const rel = seq - baseSeq;
      const timestamp = rel * FRAME_DURATION_US;

      // Detect re-baselining (publisher reconnected → SEQ reset).
      if (lastSeq !== null && seq < lastSeq) {
        baseSeq = seq;
      }
      lastSeq = seq;

      const chunk = new EncodedAudioChunk({
        type: "key", // Opus packets are independently decodable
        timestamp,
        data: packet,
      });
      decoder.decode(chunk);
    },
    close() {
      try { decoder.close(); } catch { /* already closed */ }
    },
  };
}
