/**
 * Every browser-storage key the web app reads or writes, on purpose in one list.
 *
 * Existing keys are never renamed or removed: an install that holds them must keep its
 * sign-in, calibration and settings across every update (docs/specs/MUSIC-PORTAL.md, 1.2
 * and 1.3). New keys use the `mp-` prefix. `storageKeys.test.ts` scans the source and
 * fails when a key is added or dropped without updating this list, so a change here is
 * always deliberate.
 */
export interface StorageKeyEntry {
  /** The exact key, or the fixed start of a key family (`kind: "prefix"`). */
  key: string;
  kind: "exact" | "prefix";
  /** Where it is read and written. */
  owner: string;
  /** What it holds. */
  holds: string;
}

export const STORAGE_KEY_INVENTORY: readonly StorageKeyEntry[] = [
  // Account and privacy
  { key: "keyboard-sensei-access-token", kind: "exact", owner: "services/api.ts", holds: "sign-in token" },
  { key: "keyboard-sensei-crash-reporting", kind: "exact", owner: "monitoring/consent.ts", holds: "crash-report consent" },
  { key: "ks-experience", kind: "exact", owner: "contexts/ExperienceContext.tsx", holds: "simple / full experience mode" },
  { key: "ks-experience-pending", kind: "exact", owner: "contexts/ExperienceContext.tsx", holds: "experience choice not yet synced" },

  // Appearance
  { key: "ks-appearance", kind: "exact", owner: "utils/appearance.ts, index.html", holds: "theme, glass, tint, density (versioned JSON)" },
  { key: "keyboard-sensei-theme", kind: "exact", owner: "utils/appearance.ts, index.html", holds: "legacy theme, read once to seed ks-appearance" },
  { key: "keyboard-sensei-accent-theme", kind: "exact", owner: "utils/appearance.ts", holds: "legacy accent, read once to seed ks-appearance" },

  // Sound, timing and input
  { key: "ks-audio-latency-ms", kind: "exact", owner: "audio/latency.ts", holds: "output latency calibration" },
  { key: "keyboard-sensei-instrument-id", kind: "exact", owner: "utils/synth.ts", holds: "chosen sound (sampled instrument)" },
  { key: "ks-monitor-keys", kind: "exact", owner: "utils/monitorKeys.ts", holds: "play MIDI keys through the speakers" },
  { key: "keyboard-sensei-range:", kind: "prefix", owner: "utils/keyboardRange.ts", holds: "key range per MIDI device" },
  { key: "keyboard-sensei-zoom-v2:", kind: "prefix", owner: "components/piano/useKeyboardSizing.ts", holds: "on-screen keyboard width per device" },

  // Lessons and games
  { key: "ks-exercise-sheet-scale", kind: "exact", owner: "components/midi/MidiExercise.tsx", holds: "exercise sheet zoom" },
  { key: "ks-metronome-settings", kind: "exact", owner: "components/midi/MetronomeControls.tsx", holds: "metronome sound and volume" },
  { key: "ks-highlight-enabled", kind: "exact", owner: "utils/notationHighlight.ts", holds: "notation highlight on/off" },
  { key: "keyboard-sensei-note-reading-config", kind: "exact", owner: "components/games/NoteReadingGame.tsx", holds: "note-reading game options" },

  // Play-along
  { key: "ks-playalong-settings", kind: "exact", owner: "components/play/practiceSettings.ts", holds: "play-along practice settings" },
  { key: "ks-playalong-fx", kind: "exact", owner: "components/play/renderers/fx/fxStore.ts", holds: "play-along visual effects look" },
  { key: "ks-fx-debug", kind: "exact", owner: "components/play/renderers/fx/FxRenderer.ts", holds: "developer flag for renderer stats" },
  { key: "ks-practice-song:", kind: "prefix", owner: "components/play/practiceSession.ts", holds: "per-song practice memory" },
  { key: "ks-practice-song-choices:", kind: "prefix", owner: "components/play/practiceSession.ts", holds: "per-song level choices" },

  // Language
  { key: "ks-locale", kind: "exact", owner: "i18n/core.ts", holds: "chosen interface language" },

  // Music Portal
  { key: "mp-storage-version", kind: "exact", owner: "state/storageMigrations.ts", holds: "last storage migration applied" },
  { key: "mp-active-instrument", kind: "exact", owner: "contexts/InstrumentContext.tsx", holds: "instrument Learn and Today show (M1)" },
  { key: "mp-played-instruments", kind: "exact", owner: "contexts/InstrumentContext.tsx", holds: "instruments the learner plays (M1)" },
  { key: "mp-instrument-pending", kind: "exact", owner: "contexts/InstrumentContext.tsx", holds: "instrument choice not yet synced" },
  { key: "mp-instrument-prompt-done", kind: "exact", owner: "contexts/InstrumentContext.tsx", holds: "instrument prompt answered or dismissed" },
  { key: "mp-tuner-settings", kind: "exact", owner: "components/tuner/tunerSettings.ts", holds: "tuner settings and the shared A4 (M3)" },
  { key: "mp-mic-calibration:", kind: "prefix", owner: "audio/mic", holds: "mic gate and latency per input device (M2)" },
  { key: "mp-mic-device", kind: "exact", owner: "audio/mic", holds: "last microphone used" },
  { key: "mp-mic-explained", kind: "exact", owner: "audio/mic/useMicInput.ts", holds: "mic privacy explanation seen (M4)" },
  { key: "mp-piano-tuning-session", kind: "exact", owner: "components/tuning/PianoTuningAidPage.tsx", holds: "guided tuning progress (M14)" },
];
