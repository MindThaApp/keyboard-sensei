/**
 * Where the tuning aid gets audio from. The page only needs recent mono
 * samples, so tests (and later the shared mic pipeline) can supply any source.
 * Audio stays in memory on the device and is never stored or uploaded.
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

/** Browser voice processing removes partials and pumps the level; tuning needs it all off. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

const BUFFER_SECONDS = 8;
const BLOCK = 2048;

export function createMicSampleSource(): SampleSource {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let node: ScriptProcessorNode | null = null;
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
      if (ctx) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      ctx = new AudioContext();
      rate = ctx.sampleRate;
      ring = new Float32Array(Math.round(rate * BUFFER_SECONDS));
      written = 0;
      const input = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(BLOCK, 1, 1);
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) ring[(written + i) % ring.length] = data[i];
        written += data.length;
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      input.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
    },
    stop() {
      node?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      ctx = null;
      stream = null;
      node = null;
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
