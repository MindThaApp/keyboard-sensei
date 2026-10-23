import type { Document, Element } from "@xmldom/xmldom";
import { playOrder, measureForms } from "./musicxml-structure.js";

/**
 * A second, deliberately plain reading of a MusicXML score's notes, written without
 * Verovio, for tests: walks the measures in the played order (repeats expanded) and
 * lists every sounding note with its staff, pitch and onset in quarter notes. Tied
 * notes are merged into the note that starts the tie; grace notes are listed apart
 * (they take no notated time); cue notes don't sound.
 */

export interface ReferenceNote {
  /** 0-based staff, counted across parts in score order. */
  staff: number;
  midi: number;
  onsetQ: number;
  durationQ: number;
  grace: boolean;
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const children = (parent: Element, name: string): Element[] => {
  const out: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).nodeName === name) out.push(node as Element);
  }
  return out;
};
const child = (parent: Element, name: string): Element | undefined => children(parent, name)[0];
const text = (parent: Element, name: string): string | undefined => child(parent, name)?.textContent?.trim();

function midiOf(pitch: Element): number {
  const step = STEP_SEMITONES[text(pitch, "step") ?? "C"] ?? 0;
  const alter = Math.round(Number(text(pitch, "alter") ?? 0));
  const octave = Number(text(pitch, "octave") ?? 4);
  return (octave + 1) * 12 + step + alter;
}

/** Notated length of each printed measure in quarter notes (the furthest any voice reaches). */
interface MeasureNotes {
  lengthQ: number;
  notes: { staff: number; midi: number; startQ: number; durationQ: number; grace: boolean; tieStart: boolean; tieStop: boolean }[];
}

function readPart(part: Element, staffOffset: number): MeasureNotes[] {
  let divisions = 1;
  const measures: MeasureNotes[] = [];
  for (const measure of children(part, "measure")) {
    let position = 0;
    let lastStart = 0;
    let furthest = 0;
    const notes: MeasureNotes["notes"] = [];
    for (let node = measure.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      if (element.nodeName === "attributes") {
        const value = Number(text(element, "divisions"));
        if (value > 0) divisions = value;
      } else if (element.nodeName === "backup") {
        position -= Number(text(element, "duration") ?? 0);
      } else if (element.nodeName === "forward") {
        position += Number(text(element, "duration") ?? 0);
        furthest = Math.max(furthest, position);
      } else if (element.nodeName === "note") {
        const grace = Boolean(child(element, "grace"));
        const chord = Boolean(child(element, "chord"));
        const duration = grace ? 0 : Number(text(element, "duration") ?? 0);
        const start = chord ? lastStart : position;
        const pitch = child(element, "pitch");
        if (pitch && !child(element, "cue")) {
          const ties = children(element, "tie").map((tie) => tie.getAttribute("type"));
          notes.push({
            staff: staffOffset + Number(text(element, "staff") ?? 1) - 1,
            midi: midiOf(pitch),
            startQ: start / divisions,
            durationQ: duration / divisions,
            grace,
            tieStart: ties.includes("start"),
            tieStop: ties.includes("stop"),
          });
        }
        if (!chord) {
          lastStart = position;
          position += duration;
        }
        furthest = Math.max(furthest, position);
      }
    }
    measures.push({ lengthQ: furthest / divisions, notes });
  }
  return measures;
}

export function referenceNotes(doc: Document): ReferenceNote[] {
  const parts = children(doc.documentElement as Element, "part");
  if (parts.length === 0) return [];
  const order = playOrder(measureForms(parts[0]));
  const perPart: MeasureNotes[][] = [];
  let staffOffset = 0;
  for (const part of parts) {
    perPart.push(readPart(part, staffOffset));
    const staves = Math.max(1, ...Array.from(part.getElementsByTagName("staves")).map((s) => Number(s.textContent) || 1));
    staffOffset += staves;
  }

  const result: ReferenceNote[] = [];
  // Open ties by staff and pitch, so a tie continuation lengthens the note that started it.
  const openTies = new Map<string, ReferenceNote>();
  let measureStart = 0;
  for (const index of order) {
    const lengthQ = Math.max(...perPart.map((measures) => measures[index]?.lengthQ ?? 0));
    for (const measures of perPart) {
      for (const note of measures[index]?.notes ?? []) {
        const key = `${note.staff}:${note.midi}`;
        const onsetQ = measureStart + note.startQ;
        const open = note.tieStop ? openTies.get(key) : undefined;
        if (open) {
          open.durationQ = onsetQ + note.durationQ - open.onsetQ;
          if (!note.tieStart) openTies.delete(key);
          continue;
        }
        const placed: ReferenceNote = { staff: note.staff, midi: note.midi, onsetQ, durationQ: note.durationQ, grace: note.grace };
        result.push(placed);
        if (note.tieStart) openTies.set(key, placed);
      }
    }
    measureStart += lengthQ;
  }
  return result;
}
