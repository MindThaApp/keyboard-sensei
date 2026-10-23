// The daily challenge piece: generated from the date, the same on the client and the
// server. Pure TypeScript with no dependencies, so it runs anywhere.
import type { ChallengePiece } from "./generate.js";
import { hashString } from "./random.js";

export * from "./generate.js";
export * from "./theory.js";
export { validatePiece } from "./validate.js";
export { hashString, mulberry32 } from "./random.js";

/** A short, stable digest of a piece's notes, for checking two sides generated the same thing. */
export function pieceFingerprint(piece: ChallengePiece): string {
  const notes = piece.notes.map((note) => `${note.hand[0]}${note.midi}:${note.startBeat}:${note.durationBeats}`).join(" ");
  return `${piece.key.id}/${piece.tempoBpm}/${hashString(notes).toString(16).padStart(8, "0")}`;
}
