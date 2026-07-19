"use client";

/**
 * Headless streaming speech capture using the browser's Web Speech API.
 * Each side of the interview transcribes its OWN microphone locally and
 * streams finalized utterances to the expert service, which merges them into
 * the copilot's conversation memory. No audio ever leaves the browser.
 *
 * Chrome-only (webkitSpeechRecognition); silently inert elsewhere.
 */
import { useEffect, useRef } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function SpeechCapture({
  enabled,
  onTranscript,
  onSupportChange,
}: {
  enabled: boolean;
  /** Called with each finalized utterance (and interims with isFinal=false). */
  onTranscript: (text: string, isFinal: boolean) => void;
  onSupportChange?: (supported: boolean) => void;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const restartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      onSupportChange?.(false);
      return;
    }
    onSupportChange?.(true);

    let stopped = false;

    const startRecognition = () => {
      if (stopped || !enabledRef.current) return;
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript?.trim();
          if (!text) continue;
          onTranscriptRef.current(text, result.isFinal);
        }
      };
      recognition.onerror = () => {
        // 'no-speech' / 'aborted' etc. — the onend handler restarts us.
      };
      recognition.onend = () => {
        // Chrome stops recognition after ~60s or on silence; keep it rolling.
        if (stopped || !enabledRef.current) return;
        restartTimerRef.current = window.setTimeout(startRecognition, 400);
      };
      try {
        recognition.start();
      } catch {
        // start() throws if called while already started — retry shortly.
        restartTimerRef.current = window.setTimeout(startRecognition, 1000);
      }
    };

    startRecognition();

    return () => {
      stopped = true;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, [enabled, onSupportChange]);

  return null;
}
