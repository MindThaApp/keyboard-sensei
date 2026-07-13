export type MetronomeSound = "click" | "wood" | "beep" | "cowbell";

export const METRONOME_SOUNDS: ReadonlyArray<{ value: MetronomeSound; label: string; description: string }> = [
  { value: "click", label: "Click", description: "Sharp woodblock-style tick. Cuts through dense playing." },
  { value: "wood", label: "Wood", description: "Softer, drier knock. Easiest on the ear over long practice." },
  { value: "beep", label: "Beep", description: "Clean sine tone. Clearest pitch, good for quiet passages." },
  { value: "cowbell", label: "Cowbell", description: "Metallic and unmissable. For when you keep losing the beat." },
];

/**
 * Schedules one click at an absolute AudioContext time. Extracted from Metronome
 * so the Play-Along scheduler can produce identical sounds without inheriting
 * Metronome's fixed-BPM free-running clock, which cannot follow a tempo map.
 */
export function playClick(
  ctx: AudioContext,
  time: number,
  accented: boolean,
  volume: number,
  sound: MetronomeSound,
): void {
  switch (sound) {
    case "wood":
      clickWood(ctx, time, accented, volume);
      return;
    case "beep":
      clickBeep(ctx, time, accented, volume);
      return;
    case "cowbell":
      clickCowbell(ctx, time, accented, volume);
      return;
    default:
      clickDefault(ctx, time, accented, volume);
  }
}

function clickDefault(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = accented ? 1568 : 1047; // G6 / C6 — woodblock-ish
  const peak = (accented ? 0.24 : 0.14) * volume;
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}

function clickWood(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
  const bufferSize = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = accented ? 1400 : 900;
  filter.Q.value = 6;
  const gain = ctx.createGain();
  const peak = (accented ? 0.9 : 0.6) * volume;
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.05);
}

function clickBeep(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accented ? 1200 : 800;
  const peak = (accented ? 0.22 : 0.13) * volume;
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.09);
}

function clickCowbell(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
  const gain = ctx.createGain();
  const peak = (accented ? 0.2 : 0.12) * volume;
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  gain.connect(ctx.destination);
  for (const freq of [800, 540]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.3);
  }
}
