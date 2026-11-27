import { getAudioContext, getMasterBus } from "./audioEngine";

/**
 * Reference tone for tuning by ear (spec 5.1). Synthesised, not sampled, so it
 * is exact at any A4 from 415 to 466 Hz. "warm" adds a few soft harmonics,
 * which is easier to match by ear on low strings than a pure sine.
 */

export type ReferenceTimbre = "sine" | "warm";

export interface ReferenceTone {
  setFrequency(hz: number): void;
  stop(): void;
}

let periodic: { context: BaseAudioContext; wave: PeriodicWave } | null = null;

function warmWave(context: AudioContext): PeriodicWave {
  if (periodic?.context === context) return periodic.wave;
  const amplitudes = [0, 1, 0.45, 0.22, 0.12, 0.06];
  const wave = context.createPeriodicWave(new Float32Array(amplitudes), new Float32Array(amplitudes.length));
  periodic = { context, wave };
  return wave;
}

export function startReferenceTone(frequency: number, timbre: ReferenceTimbre = "sine", volume = 0.25): ReferenceTone {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  if (timbre === "warm") oscillator.setPeriodicWave(warmWave(context));
  else oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.03);
  oscillator.connect(gain);
  gain.connect(getMasterBus());
  oscillator.start(now);
  let stopped = false;
  return {
    setFrequency(hz) {
      if (!stopped) oscillator.frequency.setTargetAtTime(hz, context.currentTime, 0.01);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = context.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.05);
      oscillator.stop(t + 0.06);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    },
  };
}
