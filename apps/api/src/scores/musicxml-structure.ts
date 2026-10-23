import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";
import { InvalidScoreError } from "./score-file.js";

/**
 * An independent reading of a MusicXML score's form: which measures are played in
 * which order once repeats, numbered endings and D.C./D.S./Fine/Coda jumps are taken,
 * and which staves are a keyboard part. The import uses it to check Verovio's own
 * expansion rather than trusting it, and to repair the malformed-but-common encodings
 * Verovio gets wrong.
 */

export interface MeasureForm {
  /** The measure's `number` attribute (not unique: pickups, numbering restarts). */
  number: string;
  /** Starts a repeated section (forward repeat barline). */
  forward: boolean;
  /** Ends a repeated section (backward repeat barline). */
  backward: boolean;
  /** Times the section is played when this measure ends one (`times`, default 2). */
  times: number;
  /** The ending (volta) this measure is in, e.g. [1] or [1, 2]; null outside endings. */
  endings: number[] | null;
  /** Playback jumps, from `<sound>` (the machine-readable form of D.C., Fine, etc.). */
  daCapo: boolean;
  /** D.S.: jump back to the segno of this name ("" when unnamed). */
  dalSegno: string | null;
  segno: string | null;
  fine: boolean;
  /** "To Coda": after the jump, continue at the coda of this name. */
  toCoda: string | null;
  coda: string | null;
  /** The time signature in force, e.g. [6, 8] (null before any, or senza misura). */
  meter: [number, number] | null;
}

export interface ScoreForm {
  measures: MeasureForm[];
  /** Indices into `measures`, in the order they are played. */
  playOrder: number[];
  /** Jumps printed only as words (no `<sound>`), which no player can follow. */
  unplayableJumps: string[];
  /** Staves, counted across parts in score order (what Verovio writes as MIDI tracks). */
  staffCount: number;
  /** 0-based staff indices of the first two-staff part (a keyboard), or null. */
  keyboardStaves: [number, number] | null;
}

const children = (parent: Element, name: string): Element[] => {
  const out: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).nodeName === name) out.push(node as Element);
  }
  return out;
};

const descendants = (parent: Element | Document, name: string): Element[] => Array.from(parent.getElementsByTagName(name));

export function parseMusicXml(text: string): Document {
  let doc: Document;
  try {
    // xmldom never fetches external entities or DTDs.
    doc = new DOMParser({
      onError: (level, message) => {
        if (level === "fatalError") throw new InvalidScoreError(`The MusicXML isn't well-formed: ${message}`);
      },
    }).parseFromString(text, "text/xml");
  } catch (error) {
    if (error instanceof InvalidScoreError) throw error;
    throw new InvalidScoreError("The MusicXML isn't well-formed");
  }
  if (doc.documentElement?.nodeName !== "score-partwise") throw new InvalidScoreError("This isn't a partwise MusicXML score");
  return doc;
}

export const serializeMusicXml = (doc: Document): string => new XMLSerializer().serializeToString(doc);

const parts = (doc: Document): Element[] => children(doc.documentElement as Element, "part");

const endingNumbers = (value: string | null): number[] =>
  (value ?? "")
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

/** Repeat, ending and jump marks of one part's measures (every part carries the same ones). */
export function measureForms(part: Element): MeasureForm[] {
  const forms: MeasureForm[] = [];
  let openEnding: number[] | null = null;
  let meter: [number, number] | null = null;
  for (const measure of children(part, "measure")) {
    for (const time of descendants(measure, "time")) {
      // "3+2" beats count as 5; senza-misura or malformed times leave the meter unknown.
      const beats = (time.getElementsByTagName("beats")[0]?.textContent ?? "").split("+").reduce((sum, value) => sum + Number(value), 0);
      const beatType = Number(time.getElementsByTagName("beat-type")[0]?.textContent);
      meter = beats > 0 && beatType > 0 ? [beats, beatType] : null;
    }
    const form: MeasureForm = {
      number: measure.getAttribute("number") ?? "",
      forward: false,
      backward: false,
      times: 2,
      endings: openEnding,
      daCapo: false,
      dalSegno: null,
      segno: null,
      fine: false,
      toCoda: null,
      coda: null,
      meter,
    };
    let closesEnding = false;
    for (const barline of children(measure, "barline")) {
      for (const repeat of children(barline, "repeat")) {
        if (repeat.getAttribute("direction") === "forward") form.forward = true;
        if (repeat.getAttribute("direction") === "backward") {
          form.backward = true;
          const times = Number.parseInt(repeat.getAttribute("times") ?? "", 10);
          if (Number.isInteger(times) && times >= 2) form.times = times;
        }
      }
      for (const ending of children(barline, "ending")) {
        const type = ending.getAttribute("type");
        if (type === "start") {
          openEnding = endingNumbers(ending.getAttribute("number"));
          form.endings = openEnding;
        } else if (type === "stop" || type === "discontinue") {
          form.endings ??= endingNumbers(ending.getAttribute("number"));
          closesEnding = true;
        }
      }
    }
    for (const sound of descendants(measure, "sound")) {
      if (sound.getAttribute("dacapo") === "yes") form.daCapo = true;
      if (sound.hasAttribute("dalsegno")) form.dalSegno = sound.getAttribute("dalsegno") ?? "";
      if (sound.hasAttribute("segno")) form.segno = sound.getAttribute("segno") ?? "";
      if (sound.hasAttribute("fine")) form.fine = true;
      if (sound.hasAttribute("tocoda")) form.toCoda = sound.getAttribute("tocoda") ?? "";
      if (sound.hasAttribute("coda")) form.coda = sound.getAttribute("coda") ?? "";
    }
    if (form.endings?.length === 0) form.endings = null;
    if (closesEnding) openEnding = null;
    forms.push(form);
  }
  return forms;
}

/** Quarter notes in a bar of this meter: numerator * (4 / denominator). */
export const meterLengthQ = ([beats, beatType]: [number, number]): number => beats * (4 / beatType);

/** Largest ending number of the run of ending measures around each ending measure. */
function lastEndingOfGroup(measures: MeasureForm[]): Map<number, number> {
  const result = new Map<number, number>();
  let i = 0;
  while (i < measures.length) {
    if (!measures[i].endings) {
      i += 1;
      continue;
    }
    let j = i;
    let max = 0;
    while (j < measures.length && measures[j].endings) {
      max = Math.max(max, ...measures[j].endings!);
      j += 1;
    }
    for (let k = i; k < j; k += 1) result.set(k, max);
    i = j;
  }
  return result;
}

/**
 * The played order of measures. A backward repeat jumps to the last forward repeat
 * (or the start of the piece, or just after the previous repeated section) until it
 * has been played `times` times; on pass N, measures in an ending that doesn't list N
 * are skipped. Then, once: D.C. / D.S. jump back, and from there repeats are not taken
 * again and only the last ending of each set is played (the usual convention), until
 * Fine, or "To Coda" which continues at the coda.
 */
export function playOrder(measures: MeasureForm[]): number[] {
  const order: number[] = [];
  const lastEnding = lastEndingOfGroup(measures);
  let sectionStart = 0;
  let pass = 1;
  // The section's repeat is over: its later endings still use `pass`, then it resets.
  let sectionDone = false;
  let jumped = false;
  const timesTaken = new Map<number, number>();
  const finishSection = (i: number) => {
    sectionStart = i + 1;
    sectionDone = true;
  };
  const findMeasure = (from: number, test: (form: MeasureForm) => boolean): number => {
    for (let k = from; k < measures.length; k += 1) if (test(measures[k])) return k;
    return -1;
  };
  let i = 0;
  // A hard cap guards malformed nesting; real scores are far below it.
  while (i < measures.length && order.length < measures.length * 16) {
    const measure = measures[i];
    if (jumped) {
      // After D.C./D.S.: straight through, last endings only.
      if (measure.endings && !measure.endings.includes(lastEnding.get(i) ?? 0)) {
        i += 1;
        continue;
      }
      order.push(i);
      if (measure.fine) break;
      if (measure.toCoda !== null) {
        const name = measure.toCoda;
        const coda = findMeasure(i + 1, (form) => form.coda !== null && (name === "" || form.coda === "" || form.coda === name));
        if (coda >= 0) {
          i = coda;
          continue;
        }
      }
      i += 1;
      continue;
    }

    if (measure.forward && sectionStart !== i) {
      sectionStart = i;
      pass = 1;
      sectionDone = false;
    }
    if (measure.endings && !measure.endings.includes(pass)) {
      // Skipping the ending that holds the repeat sign means the repeat is behind us.
      if (measure.backward) finishSection(i);
      i += 1;
      continue;
    }
    if (sectionDone && !measure.endings) {
      pass = 1;
      sectionDone = false;
    }
    order.push(i);
    if (measure.backward) {
      const taken = timesTaken.get(i) ?? 1;
      if (taken < measure.times) {
        timesTaken.set(i, taken + 1);
        pass = taken + 1;
        i = sectionStart;
        continue;
      }
      finishSection(i);
    }
    if (measure.daCapo || measure.dalSegno !== null) {
      const name = measure.dalSegno;
      const target = measure.daCapo ? 0 : findMeasure(0, (form) => form.segno !== null && (name === "" || form.segno === "" || form.segno === name));
      if (target >= 0) {
        jumped = true;
        i = target;
        continue;
      }
    }
    i += 1;
  }
  return order;
}

/** Inserts an `<ending>` (start in a new left barline, stop/discontinue in the right one). */
function markEnding(measure: Element, number: string, close: "stop" | "discontinue") {
  const doc = measure.ownerDocument!;
  const left = doc.createElement("barline");
  left.setAttribute("location", "left");
  const start = doc.createElement("ending");
  start.setAttribute("number", number);
  start.setAttribute("type", "start");
  left.appendChild(start);
  measure.insertBefore(left, measure.firstChild);
  const stop = doc.createElement("ending");
  stop.setAttribute("number", number);
  stop.setAttribute("type", close);
  const right = children(measure, "barline").find((barline) => barline.getAttribute("location") === "right");
  if (right) {
    // Schema order inside <barline>: ... ending, repeat.
    right.insertBefore(stop, children(right, "repeat")[0] ?? null);
  } else {
    const barline = doc.createElement("barline");
    barline.setAttribute("location", "right");
    barline.appendChild(stop);
    measure.appendChild(barline);
  }
}

function markForwardRepeat(measure: Element) {
  const doc = measure.ownerDocument!;
  const existing = children(measure, "barline").find((barline) => (barline.getAttribute("location") ?? "right") === "left");
  const barline = existing ?? doc.createElement("barline");
  if (!existing) {
    barline.setAttribute("location", "left");
    measure.insertBefore(barline, measure.firstChild);
  }
  const repeat = doc.createElement("repeat");
  repeat.setAttribute("direction", "forward");
  barline.appendChild(repeat);
}

/**
 * Two encodings that play correctly by the usual reading but that Verovio expands
 * wrongly, repaired by writing out the sign the reading implies (in every part):
 *
 * - "Ending 1 + backward repeat, then a measure with no ending": an unbracketed last
 *   ending. Verovio then ignores the whole repeat. The measure is marked as that ending
 *   (`discontinue`: a bracket with no closing hook, as usually printed).
 * - A backward repeat with no forward repeat after an earlier repeated section: it goes
 *   back to just after that section, but Verovio goes back to the start of the piece.
 *   The forward repeat is written in.
 *
 * Returns how many repeats were repaired.
 */
export function repairRepeats(doc: Document): number {
  const allParts = parts(doc);
  if (allParts.length === 0) return 0;
  const measuresOf = allParts.map((part) => children(part, "measure"));
  const forms = measureForms(allParts[0]);
  let repaired = 0;

  for (let i = 0; i + 1 < forms.length; i += 1) {
    const current = forms[i];
    const next = forms[i + 1];
    if (!current.backward || !current.endings || next.endings) continue;
    const used = new Set(current.endings);
    const missing = Array.from({ length: current.times }, (_, k) => k + 1).filter((n) => !used.has(n));
    if (missing.length === 0) continue;
    for (const measures of measuresOf) if (measures[i + 1]) markEnding(measures[i + 1], missing.join(", "), "discontinue");
    repaired += 1;
  }

  let sectionStart = 0;
  for (let i = 0; i < forms.length; i += 1) {
    const form = forms[i];
    if (form.forward) sectionStart = i;
    if (!form.backward) continue;
    if (sectionStart > 0 && !forms[sectionStart].forward) {
      for (const measures of measuresOf) if (measures[sectionStart]) markForwardRepeat(measures[sectionStart]);
      forms[sectionStart].forward = true;
      repaired += 1;
    }
    if (!form.endings) sectionStart = i + 1;
  }
  return repaired;
}

const JUMP_WORDS: [RegExp, string][] = [
  [/\bd\.\s*c\.|\bda\s+capo\b/i, "da capo"],
  [/\bd\.\s*s\.|\bdal\s+segno\b/i, "dal segno"],
  [/\b(?:to|al)\s+coda\b/i, "coda"],
];

/** Jumps written as words where no measure carries the matching `<sound>`. */
function unplayableJumps(doc: Document, measures: MeasureForm[]): string[] {
  const playable = new Set<string>();
  for (const form of measures) {
    if (form.daCapo) playable.add("da capo");
    if (form.dalSegno !== null) playable.add("dal segno");
    if (form.toCoda !== null) playable.add("coda");
  }
  const found = new Set<string>();
  for (const words of descendants(doc, "words")) {
    const text = words.textContent ?? "";
    for (const [pattern, name] of JUMP_WORDS) if (pattern.test(text) && !playable.has(name)) found.add(name);
  }
  return [...found];
}

/** Staves per part, in score order. */
function stavesPerPart(doc: Document): number[] {
  return parts(doc).map((part) =>
    Math.max(1, ...descendants(part, "staves").map((staves) => Number.parseInt(staves.textContent ?? "1", 10) || 1)),
  );
}

export function scoreForm(doc: Document): ScoreForm {
  const allParts = parts(doc);
  const measures = allParts.length > 0 ? measureForms(allParts[0]) : [];
  const staves = stavesPerPart(doc);
  let keyboardStaves: [number, number] | null = null;
  let offset = 0;
  for (const count of staves) {
    if (count === 2 && !keyboardStaves) keyboardStaves = [offset, offset + 1];
    offset += count;
  }
  return { measures, playOrder: playOrder(measures), unplayableJumps: unplayableJumps(doc, measures), staffCount: offset, keyboardStaves };
}
