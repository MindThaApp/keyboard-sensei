import { API_URL, getToken } from "../services/api";

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

async function fetchSample(instrumentId: string, note: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  const token = getToken();
  try {
    const response = await fetch(
      `${API_URL}/instruments/${encodeURIComponent(instrumentId)}/samples/${encodeURIComponent(note)}`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
    );
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    // decodeAudioData detaches/consumes the buffer and (in Safari) uses a
    // callback-style overload too, but the promise form is supported in
    // every browser this app targets.
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
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
 * oscillator synth instead of playing silence.
 */
export class SampledInstrument {
  readonly instrumentId: string;
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Map<number, ActiveVoice>();
  private loadPromise: Promise<void> | null = null;
  private loadedCount = 0;
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
    const worker = async () => {
      while (cursor < notes.length) {
        const note = notes[cursor++];
        const buffer = await fetchSample(this.instrumentId, note, this.ctx);
        if (buffer) this.buffers.set(note, buffer);
        this.loadedCount += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, notes.length) }, worker));
  }

  playNote(midi: number, velocity = 100): void {
    const buffer = this.buffers.get(midiToSampleNoteName(midi));
    if (!buffer) return;
    // Retriggering the same note before its release finished: cut the old
    // voice with a fast fade (not a hard stop, which clicks) before starting
    // the new one.
    this.stopNote(midi, true);

    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    const level = Math.max(0, Math.min(1, velocity / 127));
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.005);
    source.connect(gain);
    gain.connect(this.output);
    source.start(now);

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

  stopNote(midi: number, immediate = false): void {
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

  /** Silences every currently-sounding note — used when the instrument is
   *  swapped out from under active playback. */
  stopAll(): void {
    for (const midi of [...this.voices.keys()]) this.stopNote(midi, true);
  }
}

/**
 * Lightweight one-off preview: fetches + decodes only the notes requested
 * (a short chord) rather than the full 88-note pack, so "preview before
 * committing" in the instrument picker doesn't force a full download.
 * Notes are cached in-process for the lifetime of the returned object only —
 * callers should discard it after use (the full SampledInstrument cache in
 * the PianoSynth facade is the one that persists across selections).
 */
export async function previewChord(
  instrumentId: string,
  midiNotes: number[],
  ctx: AudioContext,
  destination: AudioNode,
): Promise<void> {
  const buffers = await Promise.all(
    midiNotes.map((midi) => fetchSample(instrumentId, midiToSampleNoteName(midi), ctx)),
  );
  const now = ctx.currentTime;
  const holdS = 1.1;
  const releaseS = 0.35;
  for (const buffer of buffers) {
    if (!buffer) continue;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
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
