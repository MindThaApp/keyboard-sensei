import { fetchLayeredPianoMeta, LayeredPiano, previewLayeredChord } from "./layeredPiano";
import { previewChord, SampledInstrument, type SampleVoiceBank } from "./sampler";

/**
 * Builds the right voice for an instrument id: the layered piano for packs that describe themselves as
 * one, the plain one-sample-per-key sampler for everything else.
 */
export async function createSampleVoiceBank(
  instrumentId: string,
  ctx: BaseAudioContext,
  destination: AudioNode,
): Promise<SampleVoiceBank> {
  const meta = await fetchLayeredPianoMeta(instrumentId);
  return meta ? new LayeredPiano(instrumentId, ctx, destination, meta) : new SampledInstrument(instrumentId, ctx, destination);
}

/** Plays a short chord on an instrument, fetching only the recordings it needs. */
export async function previewInstrumentChord(
  instrumentId: string,
  midiNotes: number[],
  ctx: BaseAudioContext,
  destination: AudioNode,
): Promise<void> {
  const meta = await fetchLayeredPianoMeta(instrumentId);
  if (meta) await previewLayeredChord(instrumentId, meta, midiNotes, ctx, destination);
  else await previewChord(instrumentId, midiNotes, ctx as AudioContext, destination);
}
