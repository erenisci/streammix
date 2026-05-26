/**
 * Subscriber WebSocket client.
 *
 * Connects to the relay's /subscribe?channel=... endpoint, listens for binary
 * frames, decodes the header, dispatches by message type. The decoder is the
 * one in @streammix/shared so the contract is enforced byte-for-byte.
 */

import {
  decodeError,
  decodeFingerprint,
  decodeFrame,
  decodeTrackList,
  decodeTrackMeta,
  MessageType,
  SUBPROTOCOL,
  type Frame,
  type TrackInfo,
} from "@streammix/shared";

export interface RelayEvents {
  onTrackList?: (tracks: TrackInfo[]) => void;
  onAudio?: (trackID: number, frame: Frame) => void;
  onFingerprint?: (trackID: number, hash: bigint, windowMs: number) => void;
  onTrackMeta?: (trackID: number, meta: { title?: string; artist?: string; albumArtUrl?: string }) => void;
  onError?: (code: string, message: string) => void;
  onConnect?: () => void;
  onDisconnect?: (cleanly: boolean) => void;
}

export interface RelayClient {
  close(): void;
  /** Returns true if currently open. */
  isOpen(): boolean;
}

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000, 15000];

export function connect(relayURL: string, channelID: string, events: RelayEvents): RelayClient {
  let closed = false;
  let attempt = 0;
  let ws: WebSocket | null = null;

  const open = (): void => {
    if (closed) return;
    const url = `${relayURL}/subscribe?channel=${encodeURIComponent(channelID)}`;
    ws = new WebSocket(url, [SUBPROTOCOL]);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      attempt = 0;
      events.onConnect?.();
    };
    ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      handleMessage(new Uint8Array(e.data), events);
    };
    ws.onclose = (e) => {
      events.onDisconnect?.(e.wasClean);
      ws = null;
      if (!closed) scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose will follow; nothing to do here.
    };
  };

  const scheduleReconnect = (): void => {
    if (closed) return;
    const wait = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]!;
    attempt++;
    setTimeout(open, wait);
  };

  open();

  return {
    close(): void {
      closed = true;
      ws?.close(1000, "client closed");
    },
    isOpen(): boolean {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}

function handleMessage(data: Uint8Array, events: RelayEvents): void {
  let frame: Frame;
  try {
    frame = decodeFrame(data);
  } catch {
    // Unknown / malformed frame — drop silently for forward compat.
    return;
  }
  switch (frame.type) {
    case MessageType.TrackList:
      try {
        const tl = decodeTrackList(frame.payload);
        events.onTrackList?.(tl.tracks);
      } catch {
        /* ignore */
      }
      break;
    case MessageType.AudioOpus:
      events.onAudio?.(frame.track, frame);
      break;
    case MessageType.Fingerprint:
      try {
        const fp = decodeFingerprint(frame.payload);
        events.onFingerprint?.(frame.track, fp.hash, fp.windowMs);
      } catch {
        /* ignore */
      }
      break;
    case MessageType.TrackMeta:
      try {
        const meta = decodeTrackMeta(frame.payload);
        events.onTrackMeta?.(frame.track, meta);
      } catch {
        /* ignore */
      }
      break;
    case MessageType.Error:
      try {
        const err = decodeError(frame.payload);
        events.onError?.(err.code, err.message);
      } catch {
        /* ignore */
      }
      break;
    // HELLO / STATS / SUB_TRACKS are publisher↔relay, not seen here.
    default:
      break;
  }
}
