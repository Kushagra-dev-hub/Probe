"use client";

/**
 * Headless microphone streamer. Captures this browser's own mic, downsamples to
 * 16 kHz mono linear16 PCM, and streams the raw frames to the expert service,
 * which runs them through Deepgram for high-quality transcription (far cleaner
 * than the browser's built-in Web Speech API). Audio is sent only to our own
 * backend; nothing is stored client-side.
 *
 * Works in any browser with getUserMedia + Web Audio (Chrome/Edge/Firefox/Safari).
 */
import { useEffect, useRef } from "react";

/** Downsample a Float32 mono buffer to 16 kHz Int16 PCM (little-endian). */
function downsampleToPcm16(input: Float32Array, inRate: number, outRate = 16000): ArrayBuffer {
  if (outRate >= inRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }
  const ratio = inRate / outRate;
  const newLen = Math.floor(input.length / ratio);
  const result = new Int16Array(newLen);
  let pos = 0;
  for (let i = 0; i < newLen; i += 1) {
    const next = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = pos; j < next && j < input.length; j += 1) {
      sum += input[j];
      count += 1;
    }
    const sample = count ? sum / count : 0;
    const s = Math.max(-1, Math.min(1, sample));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    pos = next;
  }
  return result.buffer;
}

export function SpeechCapture({
  enabled,
  onAudio,
  onStart,
  onStop,
  onSupportChange,
}: {
  enabled: boolean;
  /** Raw 16 kHz mono linear16 PCM frame — stream straight to the backend. */
  onAudio: (chunk: ArrayBuffer) => void;
  /** Capture began — open the upstream transcription stream. */
  onStart?: () => void;
  /** Capture ended — close the upstream stream. */
  onStop?: () => void;
  onSupportChange?: (supported: boolean) => void;
}) {
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (!enabled) return;

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(AC);
    if (!supported) {
      onSupportChange?.(false);
      return;
    }
    onSupportChange?.(true);

    let cancelled = false;
    let started = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new (AC as typeof AudioContext)();
        const inRate = ctx.sampleRate;
        source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          // We never write the output buffer, so the graph stays silent (no echo).
          const input = event.inputBuffer.getChannelData(0);
          onAudioRef.current(downsampleToPcm16(input, inRate));
        };
        source.connect(processor);
        // ScriptProcessor only fires while connected to a destination; its (unwritten)
        // output is silence, so this does not play the mic back through the speakers.
        processor.connect(ctx.destination);
        onStartRef.current?.();
        started = true;
      } catch {
        onSupportChange?.(false);
      }
    })();

    return () => {
      cancelled = true;
      if (started) onStopRef.current?.();
      try {
        if (processor) processor.onaudioprocess = null;
        processor?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        void ctx?.close();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, onSupportChange]);

  return null;
}
