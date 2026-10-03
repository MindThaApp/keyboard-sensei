import { API_URL, getToken } from "../services/api";
import { reportAudioProblem } from "../audio/audioNotices";
import { SustainPedalState } from "./sustainPedal";

/**
 * Maps a MIDI note number to the note-name keys the instrument sample packs
 * use on disk (see apps/api/scripts/fetch-instrument-library.ts /
 * instrument-manifest.json). Black keys are spelled as flats ("Db4", not
 * "C#4") — this MUST match the server's layout.json keys exactly or every
 * lookup 404s. Do not swap in @keyboard-sensei/music-theory's
 * midiNoteToName: that returns a combined "C#4/Db4" display string, which
 * matches neither spelling.
 */
const FLAT_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function midiToSampleNoteName(midi: number): string {
  const name = FLAT_NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** A real piano: A0 (21) - C8 (108), 88 keys — matches every sample pack. */
const MIN_MIDI_NOTE = 21;
const MAX_MIDI_NOTE = 108;

const RELEASE_S = 0.12;
const IMMEDIATE_RELEASE_S = 0.02;
/** Parallel fetch workers while loading a full 88-note pack. */
const LOAD_CONCURRENCY = 6;

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

type FetchResult = { buffer: AudioBuffer } | { error: string };

async function fetchSample(instrumentId: string, note: string, ctx: BaseAudioContext): Promise<FetchResult> {
  const token = getToken();
  try {
    const response = await fetch(
      `${API_URL}/instruments/${encodeURIComponent(instrumentId)}/samples/${encodeURIComponent(note)}`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    );
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const bytes = await response.arrayBuffer();
    return { buffer: await ctx.decodeAudioData(bytes) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One General MIDI instrument's 88 per-note samples, lazily fetched from the
 * authed `/instruments/:id/samples/:note` API and decoded into AudioBuffers.
 *
 * Loading is NOT awaited by callers that just want to switch voices — `load()`
 * kicks off the fetch/decode work and callers poll `isLoaded` /
 * `loadProgress`. Until a note's buffer has actually landed, `hasSample()`
 * returns false so the caller (PianoSynth's facade) can fall back to the
 * oscillator synth instead of playing silence. Notes that FAIL to load are
 * reported to the user (see reportAudioProblem), not silently substituted.
 */
export class SampledInstrument {
  readonly instrumentId: string;
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Map<number, ActiveVoice>();
  private readonly sustain = new SustainPedalState();
  private loadPromise: Promise<void> | null = null;
  private loadedCount = 0;
  private failedCount = 0;
  private disposed = false;
  private readonly totalCount = MAX_MIDI_NOTE - MIN_MIDI_NOTE + 1;

  constructor(instrumentId: string, ctx: AudioContext, destination: AudioNode) {
    this.instrumentId = instrumentId;
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.connect(destination);
  }

  get loadProgress(): number {
    return this.loadedCount / this.totalCount;
  }

  /** True once every note has been attempted (successes AND failures both count —
   *  a handful of missing samples shouldn't leave the instrument permanently "loading"). */
  get isLoaded(): boolean {
    return this.loadedCount >= this.totalCount;
  }

  /** Bytes of decoded audio held in memory (32-bit float per sample per channel). */
  get decodedBytes(): number {
    let bytes = 0;
    for (const buffer of this.buffers.values()) bytes += buffer.length * buffer.numberOfChannels * 4;
    return bytes;
  }

  hasSample(midi: number): boolean {
    return this.buffers.has(midiToSampleNoteName(midi));
  }

  /** Idempotent — safe to call every time the instrument is selected; only fetches once. */
  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    const notes: string[] = [];
    for (let midi = MIN_MIDI_NOTE; midi <= MAX_MIDI_NOTE; midi++) notes.push(midiToSampleNoteName(midi));
    let cursor = 0;
    let firstError: string | null = null;
    const worker = async () => {
      while (cursor < notes.length && !this.disposed) {
        const note = notes[cursor++];
        const result = await fetchSample(this.instrumentId, note, this.ctx);
        if (this.disposed) return;
        if ("buffer" in result) {
          this.buffers.set(note, result.buffer);
        } else {
          this.failedCount += 1;
          firstError ??= `${note}: ${result.error}`;
        }
        this.loadedCount += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, notes.length) }, worker));
    if (this.disposed || this.failedCount === 0) return;
    if (this.failedCount >= this.totalCount) {
      reportAudioProblem(
        `The "${this.instrumentId}" instrument couldn't be loaded, so you're hearing the built-in synth instead.`,
        firstError,
      );
    } else {
      reportAudioProblem(
        `${this.failedCount} of ${this.totalCount} "${this.instrumentId}" notes couldn't be loaded; those keys use the built-in synth.`,
        firstError,
      );
    }
  }

  playNote(midi: number, velocity = 100): void {
    const buffer = this.buffers.get(midiToSampleNoteName(midi));
    if (!buffer) return;
    this.sustain.noteOn(midi);
    // Retriggering the same note before its release finished: cut the old
    // voice with a fast fade (not a hard stop, which clicks) before starting
    // the new one.
    this.stopNoteNow(midi, true);

    const now = this.ctx.currentTime;
    const { source, gain } = this.createVoice(buffer, velocity, now);
    const voice: ActiveVoice = { source, gain };
    this.voices.set(midi, voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      // Only clear the map entry if this source is still the current voice for
      // this note — a fast retrigger may already have replaced it.
      if (this.voices.get(midi) === voice) this.voices.delete(midi);
    };
  }

  /**
   * A note with a known start and end, for the lookahead scheduler (guide notes,
   * accompaniment, previews). Independent of the live voices and the sustain
   * pedal. Returns a cancel function, or null when the sample isn't loaded.
   */
  scheduleNote(midi: number, velocity: number, startTime: number, endTime: number): (() => void) | null {
    const buffer = this.buffers.get(midiToSampleNoteName(midi));
    if (!buffer) return null;
    const { source, gain } = this.createVoice(buffer, velocity, startTime);
    const releaseAt = Math.max(startTime + 0.01, endTime);
    gain.gain.setValueAtTime(velocityLevel(velocity), releaseAt);
    gain.gain.linearRampToValueAtTime(0, releaseAt + RELEASE_S);
    source.stop(releaseAt + RELEASE_S + 0.02);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    return () => {
      const now = this.ctx.currentTime;
      if (now < startTime) {
        source.onended = null;
        source.stop();
        source.disconnect();
        gain.disconnect();
        return;
      }
      if (now >= releaseAt) return; // already releasing
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + IMMEDIATE_RELEASE_S);
      source.stop(now + IMMEDIATE_RELEASE_S + 0.02);
    };
  }

  private createVoice(buffer: AudioBuffer, velocity: number, startTime: number): ActiveVoice {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocityLevel(velocity), startTime + 0.005);
    source.connect(gain);
    gain.connect(this.output);
    source.start(startTime);
    return { source, gain };
  }

  stopNote(midi: number, immediate = false): void {
    if (!immediate && !this.sustain.noteOff(midi)) return;
    this.stopNoteNow(midi, immediate);
  }

  private stopNoteNow(midi: number, immediate = false): void {
    const voice = this.voices.get(midi);
    if (!voice) return;
    const releaseS = immediate ? IMMEDIATE_RELEASE_S : RELEASE_S;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseS);
    voice.source.stop(now + releaseS + 0.02);
    this.voices.delete(midi);
  }

  setSustainPedal(down: boolean): void {
    for (const midi of this.sustain.setDown(down)) this.stopNoteNow(midi);
  }

  /** Silences every currently-sounding note — used when the instrument is
   *  swapped out from under active playback. */
  stopAll(): void {
    this.sustain.clear();
    for (const midi of [...this.voices.keys()]) this.stopNoteNow(midi, true);
  }

  /** Frees the decoded samples. The instrument is unusable afterwards. */
  dispose(): void {
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
    this.output.disconnect();
  }
}

function velocityLevel(velocity: number): number {
  return Math.max(0, Math.min(1, velocity / 127));
}

/**
 * Lightweight one-off preview: fetches + decodes only the notes requested
 * (a short chord) rather than the full 88-note pack, so "preview before
 * committing" in the instrument picker doesn't force a full download.
 */
export async function previewChord(
  instrumentId: string,
  midiNotes: number[],
  ctx: AudioContext,
  destination: AudioNode,
): Promise<void> {
  const results = await Promise.all(
    midiNotes.map((midi) => fetchSample(instrumentId, midiToSampleNoteName(midi), ctx)),
  );
  const failed = results.filter((result) => "error" in result);
  if (failed.length > 0) {
    reportAudioProblem(`The "${instrumentId}" preview couldn't be loaded.`, failed[0]);
  }
  const now = ctx.currentTime;
  const holdS = 1.1;
  const releaseS = 0.35;
  for (const result of results) {
    if (!("buffer" in result)) continue;
    const source = ctx.createBufferSource();
    source.buffer = result.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
    gain.gain.setValueAtTime(0.5, now + holdS);
    gain.gain.linearRampToValueAtTime(0, now + holdS + releaseS);
    source.connect(gain);
    gain.connect(destination);
    source.start(now);
    source.stop(now + holdS + releaseS + 0.05);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
}
