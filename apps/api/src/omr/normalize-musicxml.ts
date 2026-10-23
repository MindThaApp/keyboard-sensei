import type { Document, Element } from "@xmldom/xmldom";
import { parseMusicXml, serializeMusicXml } from "../scores/musicxml-structure.js";

/**
 * Tidies the MusicXML that sheet-music recognition writes before it goes through the
 * score import. Two habits of homr's output make Verovio play it wrongly:
 *
 * 1. Voices interleaved in time. homr writes a measure's notes in the order they occur,
 *    hopping between voices with <backup>. That is valid MusicXML, but Verovio appends each
 *    voice's notes one after another and loses the gaps, so bars come out longer than their
 *    time signature and every later note drifts (measured: 31 of 35 bars of the WTK C major
 *    prelude). Each voice is rewritten here as one contiguous run from the start of the bar,
 *    with <forward> for its gaps and a <backup> to the barline before the next voice. Every
 *    note keeps its onset; only the order of the elements changes.
 * 2. A forward repeat written as a right-hand barline at the start of the bar it opens.
 *    It is moved to the left, where a forward repeat belongs.
 *
 * Attributes and print elements stay at the start of the bar (homr writes them only there).
 */
export function normalizeRecognisedMusicXml(text: string): { text: string; reorderedMeasures: number; movedRepeats: number } {
  const doc = parseMusicXml(text);
  let reorderedMeasures = 0;
  let movedRepeats = 0;
  for (const measure of elements(doc.documentElement as Element, "measure", true)) {
    movedRepeats += fixForwardRepeats(measure);
    if (regroupVoices(doc, measure)) reorderedMeasures += 1;
  }
  return { text: serializeMusicXml(doc), reorderedMeasures, movedRepeats };
}

function elements(parent: Element, name: string, deep = false): Element[] {
  if (deep) return Array.from(parent.getElementsByTagName(name));
  return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1 && (node as Element).nodeName === name);
}

const childText = (element: Element, name: string): string | null => elements(element, name)[0]?.textContent?.trim() ?? null;
const childNumber = (element: Element, name: string): number => Number(childText(element, name) ?? 0) || 0;
const has = (element: Element, name: string): boolean => elements(element, name).length > 0;

function fixForwardRepeats(measure: Element): number {
  let moved = 0;
  for (const barline of elements(measure, "barline")) {
    const repeat = elements(barline, "repeat")[0];
    if (repeat?.getAttribute("direction") === "forward" && barline.getAttribute("location") !== "left") {
      barline.setAttribute("location", "left");
      moved += 1;
    }
  }
  return moved;
}

/** A note and the chord notes stacked on it: they start together. */
interface NoteEvent {
  notes: Element[];
  onset: number;
  duration: number;
  voice: string;
  staff: string;
}

function regroupVoices(doc: Document, measure: Element): boolean {
  const nodes = Array.from(measure.childNodes).filter((node): node is Element => node.nodeType === 1);
  const events: NoteEvent[] = [];
  const leading: Element[] = [];
  const trailing: Element[] = [];
  let cursor = 0;
  let movedSomething = false;
  for (const node of nodes) {
    switch (node.nodeName) {
      case "note": {
        const duration = has(node, "grace") ? 0 : childNumber(node, "duration");
        const last = events[events.length - 1];
        if (has(node, "chord") && last) {
          last.notes.push(node);
          break;
        }
        events.push({ notes: [node], onset: cursor, duration, voice: childText(node, "voice") ?? "1", staff: childText(node, "staff") ?? "1" });
        cursor += duration;
        break;
      }
      case "backup":
        cursor = Math.max(0, cursor - childNumber(node, "duration"));
        movedSomething = true;
        break;
      case "forward":
        cursor += childNumber(node, "duration");
        break;
      case "barline":
        (node.getAttribute("location") === "right" ? trailing : leading).push(node);
        break;
      default:
        // attributes, print, direction, ...: kept ahead of the notes.
        leading.push(node);
    }
  }
  if (!movedSomething) return false;

  const voices = new Map<string, NoteEvent[]>();
  for (const event of events) {
    const key = `${event.staff}\u0000${event.voice}`;
    voices.set(key, [...(voices.get(key) ?? []), event]);
  }
  const order = [...voices.values()].sort(
    (a, b) => Number(a[0]!.staff) - Number(b[0]!.staff) || Number(a[0]!.voice) - Number(b[0]!.voice),
  );

  const rebuilt: Element[] = [...leading];
  const motion = (name: "forward" | "backup", amount: number, event: NoteEvent) => {
    const element = doc.createElement(name);
    const duration = doc.createElement("duration");
    duration.appendChild(doc.createTextNode(String(amount)));
    element.appendChild(duration);
    if (name === "forward") {
      for (const [tag, value] of [["voice", event.voice], ["staff", event.staff]] as const) {
        const child = doc.createElement(tag);
        child.appendChild(doc.createTextNode(value));
        element.appendChild(child);
      }
    }
    return element;
  };
  let position = 0;
  order.forEach((voice, index) => {
    if (index > 0 && position > 0) rebuilt.push(motion("backup", position, voice[0]!));
    position = 0;
    // Stable: notes that start together keep their order (grace notes before their note).
    for (const event of [...voice].sort((a, b) => a.onset - b.onset)) {
      if (event.onset > position) rebuilt.push(motion("forward", event.onset - position, event));
      // A voice overlapping itself is a recognition error; keep each note's onset regardless.
      if (event.onset < position) rebuilt.push(motion("backup", position - event.onset, event));
      rebuilt.push(...event.notes);
      position = event.onset + event.duration;
    }
  });
  rebuilt.push(...trailing);

  for (const node of Array.from(measure.childNodes)) measure.removeChild(node);
  for (const node of rebuilt) measure.appendChild(node);
  return true;
}
