const A4_MIDI_NOTE = 69;
const A4_FREQUENCY_HZ = 440;

function midiToFrequency(note: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, (note - A4_MIDI_NOTE) / 12);
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

/** Simple Web Audio triangle-wave synth with a percussive envelope, standing in for real piano samples in the MVP. */
export class PianoSynth {
  private ctx: AudioContext | null = null;
  private voices = new Map<number, Voice>();

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playNote(note: number, velocity = 100): void {
    const ctx = this.ensureContext();
    this.stopNote(note, true);

    const oscillator = ctx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = midiToFrequency(note);

    const gain = ctx.createGain();
    const peak = Math.min(0.25, (velocity / 127) * 0.3);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.3, 0.001), ctx.currentTime + 0.6);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    this.voices.set(note, { oscillator, gain });
  }

  stopNote(note: number, immediate = false): void {
    const voice = this.voices.get(note);
    if (!voice || !this.ctx) return;
    const releaseTime = immediate ? 0.02 : 0.15;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    voice.oscillator.stop(now + releaseTime + 0.02);
    this.voices.delete(note);
  }
}

export const pianoSynth = new PianoSynth();

