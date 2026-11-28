import { openMic, type MicCapture } from "../pianoCheck/micCapture";

/**
 * Where the tuning aid gets audio from. The page only needs recent mono
 * samples, so tests can supply any source. The microphone source is the Piano
 * check's raw capture (voice processing off, AudioWorklet tap) feeding a ring
 * buffer. Audio stays in memory on the device and is never stored or uploaded.
 */
export interface SampleSource {
  readonly sampleRate: number;
  start(): Promise<void>;
  stop(): void;
  /** The most recent `count` samples (fewer if not enough have arrived yet). */
  latest(count: number): Float32Array;
  /** Waits `skipMs` (to pass the hammer attack), then collects `durationMs` of audio. */
  capture(durationMs: number, skipMs?: number): Promise<Float32Array>;
}

const BUFFER_SECONDS = 8;

export function createMicSampleSource(): SampleSource {
  let mic: MicCapture | null = null;
  let ring = new Float32Array(48000 * BUFFER_SECONDS);
  let written = 0;
  let rate = 48000;

  const latest = (count: number) => {
    const n = Math.min(count, written, ring.length);
    const out = new Float32Array(n);
    const end = written % ring.length;
    for (let i = 0; i < n; i++) out[i] = ring[(end - n + i + ring.length) % ring.length];
    return out;
  };

  return {
    get sampleRate() {
      return rate;
    },
    async start() {
      if (mic) return;
      written = 0;
      mic = await openMic((chunk) => {
        for (let i = 0; i < chunk.length; i++) ring[(written + i) % ring.length] = chunk[i];
        written += chunk.length;
      });
      if (mic.sampleRate !== rate || ring.length !== Math.round(mic.sampleRate * BUFFER_SECONDS)) {
        rate = mic.sampleRate;
        ring = new Float32Array(Math.round(rate * BUFFER_SECONDS));
        written = 0;
      }
    },
    stop() {
      mic?.close();
      mic = null;
    },
    latest,
    capture(durationMs, skipMs = 300) {
      return new Promise((resolve) => {
        const startAt = written;
        const skip = Math.round((skipMs / 1000) * rate);
        const want = Math.round((durationMs / 1000) * rate);
        const poll = () => {
          if (written - startAt >= skip + want) resolve(latest(want));
          else setTimeout(poll, 50);
        };
        poll();
      });
    },
  };
}
