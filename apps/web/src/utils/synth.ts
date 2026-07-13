import { registerAudioContext } from "./audioUnlock";
import { previewChord, SampledInstrument } from "./sampler";
import { SustainPedalState } from "./sustainPedal";

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

const INSTRUMENT_STORAGE_KEY = "keyboard-sensei-instrument-id";

function loadStoredInstrumentId(): string | null {
  try {
    return localStorage.getItem(INSTRUMENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoredInstrumentId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
    else localStorage.setItem(INSTRUMENT_STORAGE_KEY, id);
  } catch {
    // Private browsing / storage disabled — the choice just won't persist across reloads.
  }
}

/**
 * Dependency-free Web Audio piano voice. Not a sample library, but shaped to
 * behave like one: three layered partials (fundamental + soft octave + faint
 * twelfth) through a key-tracked lowpass whose cutoff falls after the attack
 * (bright hammer strike settling into a mellow body), a velocity-sensitive
 * two-stage decay (pianos keep decaying while held), and a shared compressor
 * so chords don't clip.
 *
 * This class is also the FACADE for the whole app's piano voice: every
 * existing caller (MidiContext, playalongEngine, accompanimentPlayer,
 * VirtualPiano) only ever calls playNote/stopNote on the `pianoSynth`
 * singleton below, and keeps working completely unchanged.
 * `useInstrument()` swaps in a real sampled voice
 * (apps/web/src/utils/sampler.ts) underneath; when none is selected, or the
 * selected one is still loading its 88 samples, playback silently falls back
 * to this oscillator synth so the keyboard is never silent.
 */
export class PianoSynth {
  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;
  private voices = new Map<number, Voice>();

  /** Instruments already switched to, keyed by id — switching back to a
   *  previously-loaded instrument is instant, samples aren't re-fetched. */
  private samplerCache = new Map<string, SampledInstrument>();
  private activeSampler: SampledInstrument | null = null;
  private activeInstrumentId: string | null = null;
  private readonly sustain = new SustainPedalState();
  /** Which engine actually produced the currently-sounding voice for a note, so
   *  stopNote() releases the right one even if the selected instrument changed
   *  between the note-on and note-off (e.g. the user switched voices mid-note). */
  private noteEngine = new Map<number, "synth" | SampledInstrument>();

  constructor() {
    const storedId = loadStoredInstrumentId();
    if (storedId) void this.useInstrument(storedId);
  }

  get currentInstrumentId(): string | null {
    return this.activeInstrumentId;
  }

  /**
   * Switches the active voice. `null` reverts to the built-in oscillator
   * synth. Resolves once the instrument's samples have fully loaded — but
   * callers do NOT need to await this for the keyboard to keep working: the
   * synth fallback covers playback the instant this is called, before the
   * returned promise settles.
   */
  async useInstrument(instrumentId: string | null): Promise<void> {
    this.activeInstrumentId = instrumentId;
    saveStoredInstrumentId(instrumentId);

    if (instrumentId === null) {
      this.activeSampler = null;
      return;
    }

    const ctx = this.ensureContext();
    let sampler = this.samplerCache.get(instrumentId);
    if (!sampler) {
      sampler = new SampledInstrument(instrumentId, ctx, this.master!);
      this.samplerCache.set(instrumentId, sampler);
    }
    this.activeSampler = sampler;
    await sampler.load();
  }

  /** For a picker UI to show load progress without reaching into internals. */
  instrumentLoadState(instrumentId: string): { loaded: boolean; progress: number } {
    const sampler = this.samplerCache.get(instrumentId);
    if (!sampler) return { loaded: false, progress: 0 };
    return { loaded: sampler.isLoaded, progress: sampler.loadProgress };
  }

  /** Plays a short C-E-G chord on the given instrument (fetching just those
   *  three notes, not the full 88-sample pack), so a picker can preview a
   *  voice before committing to a full download. */
  async previewInstrument(instrumentId: string, midiNotes: number[] = [60, 64, 67]): Promise<void> {
    const ctx = this.ensureContext();
    await previewChord(instrumentId, midiNotes, ctx, this.master!);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // A MIDI note-on is NOT a user gesture, so resume() here is ignored by the
      // browser until the user actually clicks something. Register instead, and
      // audioUnlock resumes us on the first real gesture. Without this, a MIDI
      // keyboard lights up the on-screen keys but makes no sound until you click.
      registerAudioContext(this.ctx);
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
    this.sustain.noteOn(note);
    if (this.activeSampler && this.activeSampler.isLoaded && this.activeSampler.hasSample(note)) {
      this.activeSampler.playNote(note, velocity);
      this.noteEngine.set(note, this.activeSampler);
      return;
    }
    this.playSynthNote(note, velocity);
    this.noteEngine.set(note, "synth");
  }

  stopNote(note: number, immediate = false): void {
    if (!immediate && !this.sustain.noteOff(note)) return;
    this.stopNoteNow(note, immediate);
  }

  setSustainPedal(down: boolean): void {
    for (const sampler of this.samplerCache.values()) sampler.setSustainPedal(down);
    for (const note of this.sustain.setDown(down)) this.stopNoteNow(note);
  }

  stopAll(): void {
    this.sustain.clear();
    for (const sampler of this.samplerCache.values()) sampler.stopAll();
    for (const note of [...this.noteEngine.keys()]) this.stopNoteNow(note, true);
    for (const note of [...this.voices.keys()]) this.stopSynthNote(note, true);
  }

  private stopNoteNow(note: number, immediate = false): void {
    const engine = this.noteEngine.get(note);
    this.noteEngine.delete(note);
    if (engine instanceof SampledInstrument) {
      engine.stopNote(note, immediate);
      return;
    }
    this.stopSynthNote(note, immediate);
  }

  private playSynthNote(note: number, velocity: number): void {
    const ctx = this.ensureContext();
    this.stopSynthNote(note, true);

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

  private stopSynthNote(note: number, immediate = false): void {
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
