// Platform-free play-along domain logic: song parsing (tempo map, beat grid,
// time-signature segments, keys), the play-along engine, excerpts, keyboard
// ranges and MIDI recording. No DOM, no Web Audio — see tsconfig.json.
export * from "./clickGrid";
export * from "./emitter";
export * from "./engine";
export * from "./keyboardRange";
export * from "./keySignature";
export * from "./midiRecorder";
export * from "./song";
export * from "./songExcerpt";
