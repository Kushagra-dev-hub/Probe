/**
 * Deepgram live transcription proxy.
 *
 * Each browser streams its own microphone as raw 16 kHz linear16 PCM over the
 * Socket.IO connection; the expert opens a Deepgram streaming WebSocket per
 * speaker and relays the resulting transcript back. Keeping the key server-side
 * (never in the browser) and using Deepgram's `nova` models gives far cleaner
 * transcription than the browser's built-in Web Speech API.
 *
 * If `DEEPGRAM_API_KEY` is unset the factory returns null and the caller simply
 * produces no transcript (graceful no-op) — nothing else breaks.
 */
import WebSocket from "ws";

const DG_URL = "wss://api.deepgram.com/v1/listen";
const MODEL = process.env.DEEPGRAM_STT_MODEL || "nova-2";
const LANGUAGE = process.env.DEEPGRAM_LANGUAGE || "en";
const KEEPALIVE_MS = 8000;

export function deepgramAvailable(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export type DeepgramStream = {
  /** Push a raw 16 kHz mono linear16 PCM frame. */
  push: (chunk: Buffer) => void;
  /** Close the upstream connection (mic muted / peer left). */
  close: () => void;
};

/**
 * Open a Deepgram streaming connection. `onFinal` fires once per finalized
 * segment (`is_final`); `onInterim` fires for live partials. Returns null when
 * no API key is configured.
 */
export function createDeepgramStream(opts: {
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
}): DeepgramStream | null {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    model: MODEL,
    language: LANGUAGE,
    smart_format: "true",
    punctuate: "true",
    interim_results: "true",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    // End an utterance after ~300ms of silence so segments arrive promptly.
    endpointing: "300",
  });

  const ws = new WebSocket(`${DG_URL}?${params.toString()}`, {
    headers: { Authorization: `Token ${key}` },
  });

  let open = false;
  let closed = false;
  const pending: Buffer[] = [];
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  ws.on("open", () => {
    open = true;
    for (const frame of pending.splice(0, pending.length)) {
      try {
        ws.send(frame);
      } catch {
        /* ignore */
      }
    }
    keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
          /* ignore */
        }
      }
    }, KEEPALIVE_MS);
  });

  ws.on("message", (raw: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "Results") return;
      const text = String(msg.channel?.alternatives?.[0]?.transcript || "").trim();
      if (!text) return;
      if (msg.is_final) opts.onFinal(text);
      else opts.onInterim?.(text);
    } catch {
      /* non-JSON / metadata frame — ignore */
    }
  });

  ws.on("error", (err: Error) => {
    if (!closed) opts.onError?.(err.message);
  });

  ws.on("close", () => {
    if (keepAlive) clearInterval(keepAlive);
  });

  return {
    push: (chunk: Buffer) => {
      if (closed) return;
      if (open && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(chunk);
        } catch {
          /* ignore */
        }
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // Cap the pre-open buffer so a stuck handshake can't grow unbounded.
        if (pending.length < 200) pending.push(chunk);
      }
    },
    close: () => {
      closed = true;
      if (keepAlive) clearInterval(keepAlive);
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
