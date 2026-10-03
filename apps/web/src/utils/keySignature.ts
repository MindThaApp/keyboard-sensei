// Key-signature logic is platform-free and lives in playalong-core (song parsing
// needs it). Re-exported here so the notation code keeps its import path.
export {
  displayAccidentals,
  estimateKey,
  keyFromSpec,
  keyFromToneJs,
  keySignatureAlterations,
  keySpecFor,
  rankKeys,
  resolveKey,
  spellMidi,
  type KeyInfo,
  type KeyMode,
  type KeyScore,
} from "@keyboard-sensei/playalong-core";
