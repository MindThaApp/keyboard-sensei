const A4_MIDI_NOTE = 69;
const A4_FREQUENCY_HZ = 440;

function midiToFrequency(note: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, (note - A4_MIDI_NOTE) / 12);
}

interface Voice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
}

/**
 * Dependency-free Web Audio piano voice. Not a sample library, but shaped to
 * behave like one: three layered partials (fundamental + soft octave + faint
 * twelfth) through a key-tracked lowpass whose cutoff falls after the attack
 * (bright hammer strike settling into a mellow body), a velocity-sensitive
 * two-stage decay (pianos keep decaying while held), and a shared compressor
 * so chords don't clip.
 */
export class PianoSynth {
  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;
  private voices = new Map<number, Voice>();

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -18;
      this.master.knee.value = 12;
      this.master.ratio.value = 4;
      this.master.attack.value = 0.002;
      this.master.release.value = 0.2;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playNote(note: number, velocity = 100): void {
    const ctx = this.ensureContext();
    this.stopNote(note, true);

    const now = ctx.currentTime;
    const frequency = midiToFrequency(note);
    const strike = Math.pow(velocity / 127, 1.4);

    // Bright hammer attack settling into a mellower sustained body.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    const attackCutoff = Math.min(11_000, frequency * (4 + 7 * strike));
    const settledCutoff = Math.min(6_000, frequency * (2.5 + 2.5 * strike));
    filter.frequency.setValueAtTime(attackCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(settledCutoff, 200), now + 0.35);

    const gain = ctx.createGain();
    const peak = 0.05 + strike * 0.22;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    // Two-stage decay: fast initial settle, then the long singing tail.
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.35, 0.001), now + 1.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 7);

    const partials: { type: OscillatorType; ratio: number; level: number }[] = [
      { type: "triangle", ratio: 1, level: 1 },
      { type: "sine", ratio: 2.001, level: 0.35 * Math.max(0.2, 1 - (note - 40) / 60) },
      { type: "sine", ratio: 3.003, level: 0.12 * Math.max(0.1, 1 - (note - 40) / 50) },
    ];
    const oscillators = partials.map(({ type, ratio, level }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      const partialGain = ctx.createGain();
      partialGain.gain.value = level;
      osc.connect(partialGain);
      partialGain.connect(filter);
      osc.start(now);
      osc.stop(now + 7.2);
      return osc;
    });

    filter.connect(gain);
    gain.connect(this.master!);
    this.voices.set(note, { oscillators, gain, filter });
  }

  stopNote(note: number, immediate = false): void {
    const voice = this.voices.get(note);
    if (!voice || !this.ctx) return;
    const releaseTime = immediate ? 0.02 : 0.25;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    for (const osc of voice.oscillators) osc.stop(now + releaseTime + 0.02);
    this.voices.delete(note);
  }
}

export const pianoSynth = new PianoSynth();
