import { API_URL, getToken } from "../services/api";
import { reportAudioProblem } from "../audio/audioNotices";
import { fetchSample, type SampleVoiceBank } from "./sampler";
import { SustainPedalState } from "./sustainPedal";

/**
 * The recorded-piano voice: touch layers, pitch-shifting between recorded notes,
 * damper-release recordings and a polyphony limit. Its pack is built by
 * apps/api/scripts/fetch-vcsl-piano.ts, which describes it in layout.json and the
 * server hands that over as `LayeredPianoMeta`.
 */
export interface SamplerLayer {
  key: string;
  /** Highest velocity this layer plays (inclusive); layers are ordered soft to hard. */
  maxVelocity: number;
  /** Loudness correction; the recordings are level-matched, so this is close to 1. */
  trim: number;
  /** MIDI notes that were recorded for this layer. */
  roots: number[];
}

export interface LayeredPianoMeta {
  engine: "layered-piano";
  version: number;
  layers: SamplerLayer[];
  release: { key: string; roots: number[]; seconds: number };
}

const MIN_MIDI_NOTE = 21;
const MAX_MIDI_NOTE = 108;

/** The most voices sounding at once; the oldest is faded out to make room. */
export const MAX_VOICES = 64;
const LOAD_CONCURRENCY = 6;
const BACKGROUND_LOAD_CONCURRENCY = 3;

const ATTACK_S = 0.003;
const RELEASE_S = 0.22;
const STEAL_FADE_S = 0.015;
const IMMEDIATE_RELEASE_S = 0.02;

/** Output level of the loudest touch. Tuned so the voice sits at the loudness of the other piano voices. */
export const OUTPUT_GAIN = 0.22;
const MIN_TOUCH_LEVEL = 0.04;
const TOUCH_CURVE = 1.7;

/** Damper-release recordings are a quiet detail on top of the note, never the main sound. */
const RELEASE_LEVEL = 0.35;
/** A key let go sooner than this didn't have time to settle on the dampers audibly. */
const MIN_HELD_FOR_RELEASE_S = 0.1;
const FULL_RELEASE_HELD_S = 0.6;
const PREVIEW_VELOCITY = 88;

/** The recorded note closest to `midi`; ties go to the lower one (shifting up sounds brighter than shifting down). */
export function nearestRoot(midi: number, roots: readonly number[]): number | null {
  let best: number | null = null;
  for (const root of roots) {
    if (best === null || Math.abs(root - midi) < Math.abs(best - midi)) best = root;
  }
  return best;
}

/** Playback rate that moves a recording of `root` to `midi`. */
export function playbackRateFor(midi: number, root: number): number {
  return Math.pow(2, (midi - root) / 12);
}

/** Index of the touch layer for a velocity. */
export function layerIndexFor(velocity: number, layers: readonly Pick<SamplerLayer, "maxVelocity">[]): number {
  const index = layers.findIndex((layer) => velocity <= layer.maxVelocity);
  return index === -1 ? layers.length - 1 : index;
}

/** Loudness for a velocity: a soft touch is much quieter than a hard one, but never silent. */
export function touchLevel(velocity: number): number {
  const v = Math.max(0, Math.min(127, velocity)) / 127;
  return OUTPUT_GAIN * (MIN_TOUCH_LEVEL + (1 - MIN_TOUCH_LEVEL) * Math.pow(v, TOUCH_CURVE));
}

/** How strong the damper recording is after a key has been held `heldS` seconds. */
export function releaseStrength(heldS: number): number {
  if (heldS < MIN_HELD_FOR_RELEASE_S) return 0;
  return Math.min(1, heldS / FULL_RELEASE_HELD_S);
}

/** Which of `voices` to cut when the limit is reached: a releasing voice first, then the oldest. */
export function pickVoiceToSteal<T extends { startedAt: number; releasing: boolean }>(voices: readonly T[]): T | null {
  let victim: T | null = null;
  for (const voice of voices) {
    if (!victim) {
      victim = voice;
      continue;
    }
    if (voice.releasing !== victim.releasing) {
      if (voice.releasing) victim = voice;
    } else if (voice.startedAt < victim.startedAt) {
      victim = voice;
    }
  }
  return victim;
}

export function isLayeredPianoMeta(value: unknown): value is LayeredPianoMeta {
  const meta = value as Partial<LayeredPianoMeta> | null;
  return (
    !!meta &&
    meta.engine === "layered-piano" &&
    Array.isArray(meta.layers) &&
    meta.layers.length > 0 &&
    !!meta.release &&
    Array.isArray(meta.release.roots)
  );
}

/** The layered-piano description for a pack, or null for an ordinary one-sample-per-key pack. */
export async function fetchLayeredPianoMeta(instrumentId: string): Promise<LayeredPianoMeta | null> {
  const token = getToken();
  try {
    const response = await fetch(`${API_URL}/instruments/${encodeURIComponent(instrumentId)}/sampler`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { sampler?: unknown };
    return isLayeredPianoMeta(body.sampler) ? body.sampler : null;
  } catch {
    return null;
  }
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  midi: number;
  velocity: number;
  /** Peak level this voice was started at. */
  level: number;
  startedAt: number;
  releasing: boolean;
  /** When the voice's own recording runs out (context seconds). */
  endsAt: number;
}

export class LayeredPiano implements SampleVoiceBank {
  readonly instrumentId: string;
  private readonly ctx: BaseAudioContext;
  private readonly meta: LayeredPianoMeta;
  private readonly output: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly held = new Map<number, Voice>();
  private readonly alive = new Set<Voice>();
  private readonly sustain = new SustainPedalState();
  private loadPromise: Promise<void> | null = null;
  private backgroundPromise: Promise<void> = Promise.resolve();
  private primaryDone = 0;
  private disposed = false;
  private readonly primaryIndex: number;

  constructor(instrumentId: string, ctx: BaseAudioContext, destination: AudioNode, meta: LayeredPianoMeta) {
    this.instrumentId = instrumentId;
    this.ctx = ctx;
    this.meta = meta;
    // The middle layer covers most playing, so it loads first and the instrument is playable as soon as it is in.
    this.primaryIndex = Math.floor((meta.layers.length - 1) / 2);
    this.output = ctx.createGain();
    this.output.connect(destination);
  }

  private get primaryRoots(): number[] {
    return this.meta.layers[this.primaryIndex].roots;
  }

  /** Progress of the first (playable) stage; the other layers keep loading afterwards. */
  get loadProgress(): number {
    return Math.min(1, this.primaryDone / this.primaryRoots.length);
  }

  /** Playable: the middle layer is in, the other layers and the release recordings may still be arriving. */
  get isLoaded(): boolean {
    return this.primaryDone >= this.primaryRoots.length;
  }

  /** Resolves when the other layers and the release recordings have loaded too. */
  get fullyLoaded(): Promise<void> {
    return this.backgroundPromise;
  }

  get decodedBytes(): number {
    let bytes = 0;
    for (const buffer of this.buffers.values()) bytes += buffer.length * buffer.numberOfChannels * 4;
    return bytes;
  }

  get voiceCount(): number {
    return this.alive.size;
  }

  hasSample(midi: number): boolean {
    return midi >= MIN_MIDI_NOTE && midi <= MAX_MIDI_NOTE && this.loadedRoots(this.primaryIndex).length > 0;
  }

  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private loadedRoots(layerIndex: number): number[] {
    const layer = this.meta.layers[layerIndex];
    return layer.roots.filter((root) => this.buffers.has(`${layer.key}_${root}`));
  }

  /** Fetches and decodes `keys` with `concurrency` workers; resolves with the keys that failed. */
  private async fetchAll(keys: string[], concurrency: number, onDone?: () => void): Promise<{ failed: string[]; firstError: string | null }> {
    let cursor = 0;
    const failed: string[] = [];
    let firstError: string | null = null;
    const worker = async () => {
      while (cursor < keys.length && !this.disposed) {
        const key = keys[cursor++];
        const result = await fetchSample(this.instrumentId, key, this.ctx);
        if (this.disposed) return;
        if ("buffer" in result) {
          this.buffers.set(key, result.buffer);
        } else {
          failed.push(key);
          firstError ??= `${key}: ${result.error}`;
        }
        onDone?.();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
    return { failed, firstError };
  }

  private async doLoad(): Promise<void> {
    const primary = this.meta.layers[this.primaryIndex];
    const primaryKeys = primary.roots.map((root) => `${primary.key}_${root}`);
    const { failed, firstError } = await this.fetchAll(primaryKeys, LOAD_CONCURRENCY, () => {
      this.primaryDone += 1;
    });
    if (this.disposed) return;
    if (failed.length >= primaryKeys.length) {
      reportAudioProblem(`The "${this.instrumentId}" instrument couldn't be loaded, so you're hearing the built-in synth instead.`, firstError);
      return;
    }
    if (failed.length > 0) {
      reportAudioProblem(`${failed.length} of ${primaryKeys.length} "${this.instrumentId}" notes couldn't be loaded; nearby recorded notes cover those keys.`, firstError);
    }
    this.backgroundPromise = this.loadRest();
    // The caller doesn't wait for the rest, but a failure there must not go unhandled.
    this.backgroundPromise.catch(() => undefined);
  }

  /** Other layers (outer ones last: soft playing is the least common), then the damper recordings. */
  private async loadRest(): Promise<void> {
    const order = this.meta.layers.map((_, index) => index).filter((index) => index !== this.primaryIndex);
    order.sort((a, b) => Math.abs(a - this.primaryIndex) - Math.abs(b - this.primaryIndex));
    const keys = [
      ...order.flatMap((index) => this.meta.layers[index].roots.map((root) => `${this.meta.layers[index].key}_${root}`)),
      ...this.meta.release.roots.map((root) => `${this.meta.release.key}_${root}`),
    ];
    const { failed, firstError } = await this.fetchAll(keys, BACKGROUND_LOAD_CONCURRENCY);
    if (!this.disposed && failed.length > 0) {
      reportAudioProblem(`${failed.length} of the "${this.instrumentId}" touch and release recordings couldn't be loaded.`, firstError);
    }
  }

  /**
   * Finds the recording for a note and touch: the touch's own layer if it has loaded, otherwise the
   * nearest loaded layer (soft playing right after selecting the voice still sounds, from the middle layer).
   */
  private pickSample(midi: number, velocity: number): { buffer: AudioBuffer; rate: number; trim: number } | null {
    const wanted = layerIndexFor(velocity, this.meta.layers);
    const candidates = this.meta.layers
      .map((_, index) => index)
      .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
    for (const index of candidates) {
      const layer = this.meta.layers[index];
      const root = nearestRoot(midi, this.loadedRoots(index));
      if (root === null) continue;
      const buffer = this.buffers.get(`${layer.key}_${root}`)!;
      return { buffer, rate: playbackRateFor(midi, root), trim: layer.trim };
    }
    return null;
  }

  private pickRelease(midi: number): { buffer: AudioBuffer; rate: number } | null {
    const roots = this.meta.release.roots.filter((root) => this.buffers.has(`${this.meta.release.key}_${root}`));
    const root = nearestRoot(midi, roots);
    // Above the last damped strings there is nothing to hear; don't pitch a low thump up to fill the gap.
    if (root === null || midi - root > 4) return null;
    return { buffer: this.buffers.get(`${this.meta.release.key}_${root}`)!, rate: playbackRateFor(midi, root) };
  }

  private createVoice(midi: number, velocity: number, startTime: number): Voice | null {
    const sample = this.pickSample(midi, velocity);
    if (!sample) return null;
    this.makeRoom(startTime);
    const source = this.ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = sample.rate;
    const gain = this.ctx.createGain();
    const level = touchLevel(velocity) * sample.trim;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(level, startTime + ATTACK_S);
    source.connect(gain);
    gain.connect(this.output);
    source.start(startTime);
    const voice: Voice = {
      source,
      gain,
      midi,
      velocity,
      level,
      startedAt: startTime,
      releasing: false,
      endsAt: startTime + sample.buffer.duration / sample.rate,
    };
    this.alive.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.alive.delete(voice);
      if (this.held.get(midi) === voice) this.held.delete(midi);
    };
    return voice;
  }

  /** Enforces the polyphony limit before a new voice starts. */
  private makeRoom(startTime: number): void {
    while (this.alive.size >= MAX_VOICES) {
      const victim = pickVoiceToSteal([...this.alive]);
      if (!victim) return;
      this.fadeOut(victim, Math.max(this.ctx.currentTime, startTime), STEAL_FADE_S);
      this.alive.delete(victim);
      if (this.held.get(victim.midi) === victim) this.held.delete(victim.midi);
    }
  }

  private fadeOut(voice: Voice, at: number, seconds: number): void {
    voice.releasing = true;
    const param = voice.gain.gain;
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
    param.linearRampToValueAtTime(0, at + seconds);
    try {
      voice.source.stop(at + seconds + 0.02);
    } catch {
      // Already stopped.
    }
  }

  /** Plays the damper recording for a note let go at `at` after being held for `heldS`. Returns a cancel function. */
  private playRelease(midi: number, velocity: number, at: number, heldS: number): (() => void) | null {
    const strength = releaseStrength(heldS);
    if (strength === 0) return null;
    const release = this.pickRelease(midi);
    if (!release) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = release.buffer;
    source.playbackRate.value = release.rate;
    const gain = this.ctx.createGain();
    gain.gain.value = RELEASE_LEVEL * strength * touchLevel(velocity);
    source.connect(gain);
    gain.connect(this.output);
    source.start(at);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    return () => {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Not started or already finished.
      }
      source.disconnect();
      gain.disconnect();
    };
  }

  playNote(midi: number, velocity = 100): void {
    if (!this.hasSample(midi)) return;
    this.sustain.noteOn(midi);
    // A key struck again before its release finished: cut the old voice with a short fade (a hard stop clicks).
    this.stopNoteNow(midi, true);
    const voice = this.createVoice(midi, velocity, this.ctx.currentTime);
    if (voice) this.held.set(midi, voice);
  }

  stopNote(midi: number, immediate = false): void {
    if (!immediate && !this.sustain.noteOff(midi)) return;
    this.stopNoteNow(midi, immediate);
  }

  private stopNoteNow(midi: number, immediate = false): void {
    const voice = this.held.get(midi);
    if (!voice) return;
    this.held.delete(midi);
    const now = this.ctx.currentTime;
    if (immediate) {
      this.fadeOut(voice, now, IMMEDIATE_RELEASE_S);
      return;
    }
    // A note that already rang out has nothing left to damp.
    if (now < voice.endsAt - 0.3) this.playRelease(midi, voice.velocity, now, now - voice.startedAt);
    this.fadeOut(voice, now, RELEASE_S);
  }

  /**
   * A note with a known start and end, for the lookahead scheduler (guide notes, accompaniment, previews).
   * Independent of live voices and the sustain pedal. Returns a cancel function, or null when nothing has loaded.
   */
  scheduleNote(midi: number, velocity: number, startTime: number, endTime: number): (() => void) | null {
    if (!this.hasSample(midi)) return null;
    const voice = this.createVoice(midi, velocity, startTime);
    if (!voice) return null;
    const releaseAt = Math.max(startTime + 0.01, endTime);
    const param = voice.gain.gain;
    // The attack ramp ends at startTime + ATTACK_S; hold that level until the release.
    const releaseStart = Math.max(releaseAt, startTime + ATTACK_S);
    param.setValueAtTime(voice.level, releaseStart);
    param.linearRampToValueAtTime(0, releaseStart + RELEASE_S);
    voice.source.stop(releaseStart + RELEASE_S + 0.02);
    const cancelRelease = voice.endsAt - 0.3 > releaseAt ? this.playRelease(midi, velocity, releaseAt, releaseAt - startTime) : null;
    return () => {
      cancelRelease?.();
      const now = this.ctx.currentTime;
      if (now < startTime) {
        voice.source.onended = null;
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
        this.alive.delete(voice);
        return;
      }
      if (now >= releaseAt) return; // already releasing
      this.fadeOut(voice, now, IMMEDIATE_RELEASE_S);
    };
  }

  setSustainPedal(down: boolean): void {
    for (const midi of this.sustain.setDown(down)) this.stopNoteNow(midi);
  }

  /** Silences every sounding note, e.g. when the instrument is swapped out under active playback. */
  stopAll(): void {
    this.sustain.clear();
    for (const midi of [...this.held.keys()]) this.stopNoteNow(midi, true);
  }

  dispose(): void {
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
    this.output.disconnect();
  }
}

/**
 * One-off preview for the picker: fetches only the recordings a short chord needs (middle layer) and plays
 * them, instead of downloading the whole pack.
 */
export async function previewLayeredChord(
  instrumentId: string,
  meta: LayeredPianoMeta,
  midiNotes: number[],
  ctx: BaseAudioContext,
  destination: AudioNode,
): Promise<void> {
  const layer = meta.layers[layerIndexFor(PREVIEW_VELOCITY, meta.layers)];
  const picks = midiNotes.map((midi) => ({ midi, root: nearestRoot(midi, layer.roots) }));
  const results = await Promise.all(
    picks.map(({ root }) => (root === null ? Promise.resolve({ error: "no recording" } as const) : fetchSample(instrumentId, `${layer.key}_${root}`, ctx))),
  );
  const failed = results.find((result) => "error" in result);
  if (failed && "error" in failed) reportAudioProblem(`The "${instrumentId}" preview couldn't be loaded.`, failed.error);
  const now = ctx.currentTime;
  const holdS = 1.1;
  const releaseS = 0.35;
  results.forEach((result, index) => {
    const pick = picks[index];
    if (!("buffer" in result) || pick.root === null) return;
    const source = ctx.createBufferSource();
    source.buffer = result.buffer;
    source.playbackRate.value = playbackRateFor(pick.midi, pick.root);
    const gain = ctx.createGain();
    const level = touchLevel(PREVIEW_VELOCITY) * layer.trim * 0.6;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + ATTACK_S);
    gain.gain.setValueAtTime(level, now + holdS);
    gain.gain.linearRampToValueAtTime(0, now + holdS + releaseS);
    source.connect(gain);
    gain.connect(destination);
    source.start(now);
    source.stop(now + holdS + releaseS + 0.05);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  });
}
