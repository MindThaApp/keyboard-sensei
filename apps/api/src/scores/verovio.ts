import createVerovioModule from "verovio/wasm";
import createVerovioHumdrumModule from "verovio/wasm-hum";
import { enableLogToBuffer, VerovioToolkit } from "verovio/esm";
import { addGesturalAccidentals } from "./gestural-accidentals.js";
import { InvalidScoreError, type ScoreFormat } from "./score-file.js";

/**
 * One Verovio toolkit for the process, created on first use (the WASM module costs
 * ~100 ms and tens of MB, so it isn't paid at start-up or by routes that never need it).
 * Calls are synchronous, so two imports can't interleave on it. If the WASM aborts
 * (a malformed file can do that), the instance is dropped and the next call starts fresh.
 */
let toolkitPromise: Promise<VerovioToolkit> | null = null;
/** The standard build has no Humdrum reader; the "hum" build is a second, separate WASM module, loaded only for **kern. */
let humdrumToolkitPromise: Promise<VerovioToolkit> | null = null;

const create = (createModule: () => Promise<unknown>): Promise<VerovioToolkit> =>
  createModule().then((module) => {
    // Warnings about the file go to getLog(), not the server's stdout.
    enableLogToBuffer(true, module);
    return new VerovioToolkit(module);
  });

const toolkit = (format: ScoreFormat): Promise<VerovioToolkit> => {
  if (format === "humdrum") return (humdrumToolkitPromise ??= create(createVerovioHumdrumModule));
  return (toolkitPromise ??= create(createVerovioModule));
};

const dropToolkit = (format: ScoreFormat) => {
  if (format === "humdrum") humdrumToolkitPromise = null;
  else toolkitPromise = null;
};

export interface ConvertedScore {
  /** The score as MEI, unexpanded, with stable xml:ids (what the web app engraves). */
  mei: string;
  /** Standard MIDI file of the expanded score (repeats played out). */
  midi: Uint8Array;
  /** Printed measures (0-based, score order) in the order they are played, repeats expanded. */
  playedOrder: number[];
  /** Where each played measure starts, in quarter notes, plus the end of the last one. */
  playedStartsQ: number[];
  /** Length of each printed measure in quarter notes, as Verovio times it. */
  printedLengthsQ: number[];
}

/** Verovio names the copies of a repeated element `<id>-rend2`, `<id>-rend3`, ... */
export const printedId = (id: string): string => id.replace(/-rend\d+$/, "");

const measuresInTimemap = (tk: VerovioToolkit): { id: string; qstamp: number }[] => {
  const timemap = tk.renderToTimemap({ includeMeasures: true, includeRests: true });
  const measures = timemap.flatMap((entry) => (entry.measureOn ? [{ id: printedId(entry.measureOn), qstamp: entry.qstamp }] : []));
  // The end of the last measure: the timemap's last entry (the final note-offs).
  measures.push({ id: "", qstamp: timemap[timemap.length - 1]?.qstamp ?? 0 });
  return measures;
};

/**
 * Loads the score, keeps it as MEI, then reloads that MEI with repeats expanded to
 * write the MIDI. Reloading the MEI (rather than the original) means the ids in the
 * web app's timemap, which it builds from the same MEI, are the ids in this MIDI's score.
 */
export async function convertScore(text: string, format: ScoreFormat): Promise<ConvertedScore> {
  // Verovio's ABC reader keeps the last key signature across loads in a module: a tune in
  // C or Am read after one in D plays with its sharps (K:C never clears them). So ABC gets
  // a module of its own for each import, which is dropped afterwards.
  const own = format === "abc";
  const tk = own ? await create(createVerovioModule) : await toolkit(format);
  try {
    tk.setOptions({ inputFrom: format, expandNever: true });
    if (!tk.loadData(text)) throw new InvalidScoreError(`The score couldn't be read${logSuffix(tk)}`);
    const printed = measuresInTimemap(tk);
    const printedIds = printed.slice(0, -1).map((measure) => measure.id);
    if (printedIds.length === 0) throw new InvalidScoreError("The score has no measures");
    const printedLengthsQ = printedIds.map((_, index) => printed[index + 1].qstamp - printed[index].qstamp);
    const mei = addGesturalAccidentals(tk.getMEI({}), format, text);

    tk.setOptions({ inputFrom: "mei", expandNever: false });
    if (!tk.loadData(mei)) throw new InvalidScoreError(`The score couldn't be read${logSuffix(tk)}`);
    const indexOf = new Map(printedIds.map((id, index) => [id, index]));
    const played = measuresInTimemap(tk);
    const playedOrder = played.slice(0, -1).map((measure) => indexOf.get(measure.id) ?? -1);
    const playedStartsQ = played.map((measure) => measure.qstamp);
    const midi = Uint8Array.from(Buffer.from(tk.renderToMIDI(), "base64"));
    return { mei, midi, playedOrder, playedStartsQ, printedLengthsQ };
  } catch (error) {
    if (error instanceof InvalidScoreError) throw error;
    // A WASM abort leaves the module unusable: start a new one next time.
    if (!own) dropToolkit(format);
    throw new InvalidScoreError("The score couldn't be read");
  } finally {
    if (own) tk.destroy();
  }
}

function logSuffix(tk: VerovioToolkit): string {
  const firstError = tk
    .getLog()
    .split("\n")
    .find((line) => /error/i.test(line));
  return firstError ? `: ${firstError.replace(/^\[Error\]\s*/, "").slice(0, 200)}` : "";
}
