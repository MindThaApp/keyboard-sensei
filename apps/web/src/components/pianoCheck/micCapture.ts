/**
 * Raw microphone capture for the Piano check. Processing that would change the
 * pitch or level of a ringing note (echo cancellation, noise suppression, auto
 * gain) is turned off. Chunks arrive from an AudioWorklet.
 */
export interface MicCapture {
  sampleRate: number;
  close: () => void;
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("piano-check-tap", Tap);
`;

export async function openMic(onChunk: (chunk: Float32Array) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "piano-check-tap", { numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
  src.connect(node);
  return {
    sampleRate: ctx.sampleRate,
    close: () => {
      node.port.onmessage = null;
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

/** Collects chunks and reports when a note has been struck and has rung long enough to measure. */
export class NoteListener {
  private chunks: Float32Array[] = [];
  private total = 0;
  private attackAt = -1;
  private quiet = true;
  constructor(
    private sampleRate: number,
    private onReady: (samples: Float32Array) => void,
    private needSeconds = 2.0,
  ) {}

  push(chunk: Float32Array): void {
    let e = 0;
    for (let i = 0; i < chunk.length; i++) e += chunk[i] * chunk[i];
    const rms = Math.sqrt(e / Math.max(1, chunk.length));
    this.chunks.push(chunk);
    this.total += chunk.length;
    // Keep only ~1 s of pre-roll while waiting for the key press.
    if (this.attackAt < 0) {
      if (rms > 0.01 && this.quiet) this.attackAt = this.total - chunk.length;
      else if (rms < 0.004) this.quiet = true;
      const keep = Math.round(this.sampleRate);
      while (this.attackAt < 0 && this.total - this.chunks[0].length >= keep) {
        this.total -= this.chunks.shift()!.length;
      }
      return;
    }
    if (this.total - this.attackAt >= this.needSeconds * this.sampleRate) {
      const all = new Float32Array(this.total);
      let o = 0;
      for (const c of this.chunks) { all.set(c, o); o += c.length; }
      const from = Math.max(0, this.attackAt - Math.round(this.sampleRate * 0.05));
      this.reset();
      this.onReady(all.subarray(from));
    }
  }

  reset(): void {
    this.chunks = [];
    this.total = 0;
    this.attackAt = -1;
    this.quiet = false; // wait for the previous note's tail to die away before the next attack
  }
}
