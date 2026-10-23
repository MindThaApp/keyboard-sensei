import { getAudioContext, getMasterBus } from "../audio/audioEngine";
import { isNativeApp } from "../native/platform";
import { previewChord, SampledInstrument } from "./sampler";
import { SustainPedalState } from "./sustainPedal";

const A4_MIDI_NOTE = 69;
const A4_FREQUENCY_HZ = 440;

function midiToFrequency(note: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, (note - A4_MIDI_NOTE) / 12);
}

interface Voice {
  oscillators: OscillatorNode[];
  /** Attack/decay envelope. */
  envelope: GainNode;
  /** Release stage, kept separate so a release can be scheduled ahead of time
   *  without disturbing the decay curve that's still running. */
  release: GainNode;
}

const INSTRUMENT_STORAGE_KEY = "keyboard-sensei-instrument-id";
/** Decoded instruments kept in memory: the current one plus the two most recent. */
export const MAX_CACHED_INSTRUMENTS = 3;
/** On a low-memory device: the current one plus the most recent. */
export const LOW_MEMORY_CACHED_INSTRUMENTS = 2;

interface DeviceHints {
  deviceMemory?: number;
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * How many decoded instruments to keep. A decoded instrument is about 97 MB, so
 * three of them is close to 300 MB: fine on a laptop, enough for a 4 GB tablet
 * to reload the tab. `navigator.deviceMemory` (Chrome, Edge, Android) reports
 * the device's RAM in GB, rounded down. Safari doesn't expose it at all, and an
 * iPad then has to be assumed small: iPadOS reports itself as a Mac, so it is
 * recognised as a "Mac" with a touch screen.
 */
export function maxCachedInstruments(hints: DeviceHints | undefined = typeof navigator === "undefined" ? undefined : navigator): number {
  if (!hints) return MAX_CACHED_INSTRUMENTS;
  if (typeof hints.deviceMemory === "number") {
    return hints.deviceMemory <= 4 ? LOW_MEMORY_CACHED_INSTRUMENTS : MAX_CACHED_INSTRUMENTS;
  }
  const iPad = /iPad/.test(hints.userAgent) || (/Macintosh/.test(hints.userAgent) && (hints.maxTouchPoints ?? 0) > 1);
  const iPhone = /iPhone|iPod/.test(hints.userAgent);
  return iPad || iPhone ? LOW_MEMORY_CACHED_INSTRUMENTS : MAX_CACHED_INSTRUMENTS;
}
const SYNTH_RELEASE_S = 0.25;
const SYNTH_IMMEDIATE_RELEASE_S = 0.02;
const SYNTH_MAX_RING_S = 7.2;

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

/** Cancels a scheduled note: silences it quickly if sounding, drops it if not started yet. */
export type CancelScheduledNote = () => void;

/**
 * Dependency-free Web Audio piano voice. Not a sample library, but shaped to
 * behave like one: three layered partials (fundamental + soft octave + faint
 * twelfth) through a key-tracked lowpass whose cutoff falls after the attack
 * (bright hammer strike settling into a mellow body), a velocity-sensitive
 * two-stage decay (pianos keep decaying while held), and a shared compressor
 * so chords don't clip.
 *
 * This class is also the FACADE for the whole app's piano voice. Live playing
 * (MidiContext, VirtualPiano) calls playNote/stopNote; anything with a known
 * start and end (guide notes, accompaniment, previews) calls scheduleNote from
 * the lookahead scheduler. `useInstrument()` swaps in a real sampled voice
 * (apps/web/src/utils/sampler.ts) underneath; when none is selected, or the
 * selected one is still loading, playback falls back to this oscillator synth
 * so the keyboard is never silent.
 */
export class PianoSynth {
  private voices = new Map<number, Voice>();

  /** Loaded instruments, least recently selected first. Switching back to one of
   *  these is instant; older ones are evicted (see maxCachedInstruments), since
   *  a decoded instrument is tens of megabytes. */
  private samplerCache = new Map<string, SampledInstrument>();
  private activeSampler: SampledInstrument | null = null;
  private activeInstrumentId: string | null = null;
  private readonly sustain = new SustainPedalState();
  /** The Android app always counts as low-memory: its WebView is killed (not just
   *  slowed) when decoded samples pile up, and deviceMemory over-reports there. */
  private readonly cacheLimit = isNativeApp() ? LOW_MEMORY_CACHED_INSTRUMENTS : maxCachedInstruments();
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

  /** Instrument ids whose decoded samples are in memory, least recent first. */
  get cachedInstrumentIds(): string[] {
    return [...this.samplerCache.keys()];
  }

  /** Total decoded sample memory across cached instruments, in bytes. */
  get cachedSampleBytes(): number {
    let bytes = 0;
    for (const sampler of this.samplerCache.values()) bytes += sampler.decodedBytes;
    return bytes;
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

    let sampler = this.samplerCache.get(instrumentId);
    if (sampler) {
      // Most recently used goes to the end.
      this.samplerCache.delete(instrumentId);
    } else {
      sampler = new SampledInstrument(instrumentId, getAudioContext(), getMasterBus());
    }
    this.samplerCache.set(instrumentId, sampler);
    this.activeSampler = sampler;
    this.evictOldInstruments();
    await sampler.load();
  }

  private evictOldInstruments(): void {
    while (this.samplerCache.size > this.cacheLimit) {
      const [oldestId, oldest] = this.samplerCache.entries().next().value as [string, SampledInstrument];
      if (oldest === this.activeSampler) break;
      this.samplerCache.delete(oldestId);
      oldest.dispose();
    }
  }

  /** Frees every decoded instrument except the one in use (e.g. on leaving practice),
   *  so the samples of earlier choices don't sit in memory while nothing plays. */
  releaseInactiveInstruments(): void {
    for (const [id, sampler] of [...this.samplerCache]) {
      if (sampler === this.activeSampler) continue;
      this.samplerCache.delete(id);
      sampler.dispose();
    }
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
    await previewChord(instrumentId, midiNotes, getAudioContext(), getMasterBus());
  }

  private samplerFor(note: number): SampledInstrument | null {
    const sampler = this.activeSampler;
    return sampler && sampler.isLoaded && sampler.hasSample(note) ? sampler : null;
  }

  playNote(note: number, velocity = 100): void {
    this.sustain.noteOn(note);
    const sampler = this.samplerFor(note);
    if (sampler) {
      sampler.playNote(note, velocity);
      this.noteEngine.set(note, sampler);
      return;
    }
    this.playSynthNote(note, velocity);
    this.noteEngine.set(note, "synth");
  }

  stopNote(note: number, immediate = false): void {
    if (!immediate && !this.sustain.noteOff(note)) return;
    this.stopNoteNow(note, immediate);
  }

  /**
   * Schedules a note at exact AudioContext times. Used by the lookahead scheduler
   * for everything that isn't live playing. These voices are independent of the
   * live ones (a guide note and the player's own press of the same key can sound
   * together) and of the sustain pedal.
   */
  scheduleNote(note: number, velocity: number, startTime: number, endTime: number): CancelScheduledNote {
    const sampled = this.samplerFor(note)?.scheduleNote(note, velocity, startTime, endTime);
    if (sampled) return sampled;

    const ctx = getAudioContext();
    const voice = this.createSynthVoice(note, velocity, startTime);
    const releaseAt = Math.max(startTime + 0.01, endTime);
    voice.release.gain.setValueAtTime(1, releaseAt);
    voice.release.gain.linearRampToValueAtTime(0, releaseAt + SYNTH_RELEASE_S);
    const stopAt = Math.min(startTime + SYNTH_MAX_RING_S, releaseAt + SYNTH_RELEASE_S + 0.02);
    for (const osc of voice.oscillators) osc.stop(stopAt);
    return () => {
      const now = ctx.currentTime;
      if (now < startTime) {
        for (const osc of voice.oscillators) {
          osc.stop();
          osc.disconnect();
        }
        voice.release.disconnect();
        return;
      }
      if (now >= releaseAt) return; // already releasing
      voice.release.gain.cancelScheduledValues(now);
      voice.release.gain.setValueAtTime(1, now);
      voice.release.gain.linearRampToValueAtTime(0, now + SYNTH_IMMEDIATE_RELEASE_S);
      for (const osc of voice.oscillators) osc.stop(now + SYNTH_IMMEDIATE_RELEASE_S + 0.02);
    };
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
    const ctx = getAudioContext();
    this.stopSynthNote(note, true);
    const voice = this.createSynthVoice(note, velocity, ctx.currentTime);
    for (const osc of voice.oscillators) osc.stop(ctx.currentTime + SYNTH_MAX_RING_S);
    this.voices.set(note, voice);
  }

  private createSynthVoice(note: number, velocity: number, startTime: number): Voice {
    const ctx = getAudioContext();
    const frequency = midiToFrequency(note);
    const strike = Math.pow(velocity / 127, 1.4);

    // Bright hammer attack settling into a mellower sustained body.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    const attackCutoff = Math.min(11_000, frequency * (4 + 7 * strike));
    const settledCutoff = Math.min(6_000, frequency * (2.5 + 2.5 * strike));
    filter.frequency.setValueAtTime(attackCutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(settledCutoff, 200), startTime + 0.35);

    const envelope = ctx.createGain();
    const peak = 0.05 + strike * 0.22;
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(peak, startTime + 0.004);
    // Two-stage decay: fast initial settle, then the long singing tail.
    envelope.gain.exponentialRampToValueAtTime(Math.max(peak * 0.35, 0.001), startTime + 1.1);
    envelope.gain.exponentialRampToValueAtTime(0.001, startTime + 7);

    const release = ctx.createGain();
    release.gain.value = 1;

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
      osc.start(startTime);
      return osc;
    });
    oscillators[0]!.onended = () => release.disconnect();

    filter.connect(envelope);
    envelope.connect(release);
    release.connect(getMasterBus());
    return { oscillators, envelope, release };
  }

  private stopSynthNote(note: number, immediate = false): void {
    const voice = this.voices.get(note);
    if (!voice) return;
    const ctx = getAudioContext();
    const releaseTime = immediate ? SYNTH_IMMEDIATE_RELEASE_S : SYNTH_RELEASE_S;
    const now = ctx.currentTime;
    voice.release.gain.cancelScheduledValues(now);
    voice.release.gain.setValueAtTime(voice.release.gain.value, now);
    voice.release.gain.linearRampToValueAtTime(0, now + releaseTime);
    for (const osc of voice.oscillators) osc.stop(now + releaseTime + 0.02);
    this.voices.delete(note);
  }
}

export const pianoSynth = new PianoSynth();
