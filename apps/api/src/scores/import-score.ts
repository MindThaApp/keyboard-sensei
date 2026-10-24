import type { Document } from "@xmldom/xmldom";
import ToneMidi from "@tonejs/midi";
import { normalizeAbcChords } from "./abc-chords.js";
import { meiMeasureMeters } from "./mei-meters.js";
import { meterLengthQ, parseMusicXml, repairRepeats, scoreForm, serializeMusicXml, type ScoreForm } from "./musicxml-structure.js";
import { decodeScoreFile, InvalidScoreError, type ScoreFileKind } from "./score-file.js";
import { convertScore, type ConvertedScore } from "./verovio.js";

// @tonejs/midi ships CJS; go through the default export (see src/midi-metadata.ts).
const { Midi } = ToneMidi;
type MidiFile = InstanceType<typeof Midi>;

export { InvalidScoreError };

export interface ScoreImportReport {
  printedMeasures: number;
  playedMeasures: number;
  /** Whether the played order matches an independent reading of the repeat signs; null for MEI. */
  repeatsVerified: boolean | null;
  /** Repeats whose encoding was repaired so they expand as printed. */
  repairedRepeats: number;
  /** Measures holding more than their time signature allows (a mis-encoded rhythm). */
  overfullMeasures: number;
  /** Staves that became the played notes (0-based, score order). */
  playedStaves: number[];
  staffCount: number;
  /** Plain-language notes for the uploader. */
  warnings: string[];
}

export interface ImportedScore {
  kind: ScoreFileKind;
  /** Title and composer as the score names them, for when the uploader gives none. */
  title: string | null;
  composer: string | null;
  mei: string;
  midi: Uint8Array;
  report: ScoreImportReport;
}

const sameOrder = (a: number[], b: number[]): boolean => a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Verovio writes one MIDI track per staff, in score order. When the score has a
 * keyboard part (two staves), only that part is played: its top staff is the right
 * hand, its bottom staff the left (the play-along parser takes the lower track as the
 * left hand). Voices or other instruments stay in the notation but aren't played.
 */
function keepStaves(midi: MidiFile, staves: number[]): boolean {
  const kept = staves.map((index) => midi.tracks[index]).filter((track) => track && track.notes.length > 0);
  if (kept.length === 0) return false;
  midi.tracks = kept;
  if (kept.length === 2) {
    kept[0].name = "Right hand";
    kept[1].name = "Left hand";
  }
  return true;
}

/** A time signature as long as `lengthQ`, in the meter's own beat unit where it can be. */
function signatureForLength(lengthQ: number, meter: [number, number]): [number, number] {
  for (let beatType = meter[1]; beatType <= 64; beatType *= 2) {
    const beats = (lengthQ * beatType) / 4;
    if (Math.abs(beats - Math.round(beats)) < 1e-6 && Math.round(beats) > 0) return [Math.round(beats), beatType];
  }
  return [Math.max(1, Math.round(lengthQ * 16)), 64];
}

/**
 * Verovio's MIDI places time signatures by the printed score, not the expanded one: a
 * meter change lands at the wrong tick once repeats are played out, and a D.C. back to
 * an earlier meter is never written (see the form-test fixture). The play-along grid,
 * barlines and metronome are built from these events (time-signature *segments*, with
 * their denominators), so they are rewritten from the played measures themselves: each
 * measure gets its time signature, and a measure whose real length differs (a pickup,
 * a short final bar, a mis-encoded rhythm) gets one of exactly its length, so every
 * barline lands where the score's does.
 */
function rewriteTimeSignatures(midi: MidiFile, form: { measures: { meter: [number, number] | null }[] }, converted: ConvertedScore) {
  const ppq = midi.header.ppq;
  const events: { ticks: number; timeSignature: [number, number] }[] = [];
  let meter: [number, number] = [4, 4];
  converted.playedOrder.forEach((printed, index) => {
    meter = form.measures[printed]?.meter ?? meter;
    const lengthQ = converted.playedStartsQ[index + 1] - converted.playedStartsQ[index];
    const signature = Math.abs(lengthQ - meterLengthQ(meter)) < 1e-6 || !(lengthQ > 0) ? meter : signatureForLength(lengthQ, meter);
    const previous = events[events.length - 1]?.timeSignature;
    if (previous && previous[0] === signature[0] && previous[1] === signature[1]) return;
    events.push({ ticks: Math.round(converted.playedStartsQ[index] * ppq), timeSignature: signature });
  });
  midi.header.timeSignatures = events;
  midi.header.update();
}

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  return text.length > 0 ? text : null;
};

function musicXmlCredits(doc: Document): { title: string | null; composer: string | null } {
  const first = (name: string) => doc.getElementsByTagName(name)[0]?.textContent;
  const creator = Array.from(doc.getElementsByTagName("creator")).find((element) => element.getAttribute("type") === "composer");
  return { title: clean(first("movement-title")) ?? clean(first("work-title")), composer: clean(creator?.textContent) };
}

function meiCredits(text: string): { title: string | null; composer: string | null } {
  const title = /<titleStmt>[\s\S]*?<title[^>]*>([^<]*)<\/title>/.exec(text)?.[1];
  const composer = /<persName[^>]*role="composer"[^>]*>([^<]*)</.exec(text)?.[1] ?? /<composer>\s*(?:<persName[^>]*>)?([^<]*)</.exec(text)?.[1];
  return { title: clean(title), composer: clean(composer) };
}

function abcCredits(text: string): { title: string | null; composer: string | null } {
  // The tune's own header: from X: to the K: line.
  const header: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    header.push(line);
    if (/^K:/.test(line)) break;
  }
  const field = (name: string) => header.find((line) => line.startsWith(`${name}:`))?.slice(2).replace(/\s%.*$/, "");
  return { title: clean(field("T")), composer: clean(field("C")) };
}

function humdrumCredits(text: string): { title: string | null; composer: string | null } {
  const reference = (code: string) => new RegExp(`^!!!${code}[^:]*:\\s*(.*)$`, "m").exec(text)?.[1];
  // Humdrum names composers "Last, First".
  const composer = reference("COM")?.replace(/^([^,]+),\s*(.+)$/, "$2 $1");
  return { title: clean(reference("OTL")), composer: clean(composer) };
}

/** MusicXML/MXL/MEI/ABC/**kern bytes to MEI notation plus a playable MIDI of the expanded score. */
export async function importScore(bytes: Uint8Array): Promise<ImportedScore> {
  const decoded = decodeScoreFile(bytes);
  const warnings: string[] = [];
  let text = decoded.text;
  let form: ScoreForm | null = null;
  let repairedRepeats = 0;
  let title: string | null = null;
  let composer: string | null = null;

  if (decoded.format === "musicxml") {
    const doc = parseMusicXml(text);
    ({ title, composer } = musicXmlCredits(doc));
    repairedRepeats = repairRepeats(doc);
    form = scoreForm(doc);
    if (form.unplayableJumps.length > 0) {
      warnings.push(
        `This score writes ${form.unplayableJumps.join(", ")} as plain text only, so it can't be followed: that part plays as written, without the jump.`,
      );
    }
    // The text is now UTF-8 whatever the original declared.
    text = serializeMusicXml(doc).replace(/^<\?xml[^>]*\?>/, '<?xml version="1.0" encoding="UTF-8"?>');
  }

  if (decoded.format === "mei") ({ title, composer } = meiCredits(text));
  if (decoded.format === "abc") ({ title, composer } = abcCredits(text));
  if (decoded.format === "humdrum") ({ title, composer } = humdrumCredits(text));

  // Verovio's ABC reader drops the length written after a chord; the stored original is untouched.
  const converted = await convertScore(decoded.format === "abc" ? normalizeAbcChords(text) : text, decoded.format);
  const repeatsVerified = form ? sameOrder(form.playOrder, converted.playedOrder) : null;
  if (form && !repeatsVerified) {
    warnings.push(
      `The repeats may not be played exactly as printed: ${converted.playedOrder.length} bars are played, where reading the repeat signs gives ${form.playOrder.length}.`,
    );
  }

  // Verovio times a measure by its notated values, so a bar whose rhythms add up to
  // more than the time signature (a mis-encoded tuplet, say) plays longer than written.
  const measures = form?.measures ?? [];
  const overfullMeasures = converted.printedLengthsQ.filter((lengthQ, index) => {
    const meter = measures[index]?.meter;
    return meter != null && lengthQ > meterLengthQ(meter) + 1e-6;
  }).length;
  if (overfullMeasures > 0) {
    warnings.push(
      `${overfullMeasures} ${overfullMeasures === 1 ? "bar holds" : "bars hold"} more beats than the time signature allows, so the file's rhythms are probably mis-encoded there: the timing in ${overfullMeasures === 1 ? "that bar" : "those bars"} may be off.`,
    );
  }

  const midi = new Midi(converted.midi);
  const staffCount = form?.staffCount ?? midi.tracks.length;
  let playedStaves = midi.tracks.map((_, index) => index);
  if (form?.keyboardStaves && staffCount === midi.tracks.length && staffCount > 2 && keepStaves(midi, form.keyboardStaves)) {
    playedStaves = form.keyboardStaves;
    warnings.push("Only the piano part is played; the other parts are shown in the sheet music.");
  }
  if (form) rewriteTimeSignatures(midi, form, converted);
  // ABC and **kern have no separate reading of the form (and no repeats are checked), but
  // their meters, pickups included, come from the MEI so the bar grid lands on the barlines.
  else if (decoded.format === "abc" || decoded.format === "humdrum") rewriteTimeSignatures(midi, { measures: meiMeasureMeters(converted.mei) }, converted);

  return {
    kind: decoded.kind,
    title,
    composer,
    mei: converted.mei,
    midi: midi.toArray(),
    report: {
      printedMeasures: converted.printedLengthsQ.length,
      playedMeasures: converted.playedOrder.length,
      repeatsVerified,
      repairedRepeats,
      overfullMeasures,
      playedStaves,
      staffCount,
      warnings,
    },
  };
}
