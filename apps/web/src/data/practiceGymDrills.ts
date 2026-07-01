import type { MidiExercise } from "@keyboard-sensei/shared-types";
import { ELEMENTARY_CONFIG } from "@keyboard-sensei/midi-engine";

export interface PracticeGymDrill {
  id: string;
  label: string;
  description: string;
  exercise: MidiExercise;
}

/** Minimal MIDI Practice Gym — freeform preset drills, not tied to lesson progress. */
export const practiceGymDrills: PracticeGymDrill[] = [
  {
    id: "gym-five-finger",
    label: "C Major Five-Finger Pattern",
    description: "Play C-D-E-F-G ascending, then G-F-E-D-C descending.",
    exercise: {
      exerciseId: "gym-five-finger",
      tempoBpm: 80,
      difficulty: "intermediate",
      ...ELEMENTARY_CONFIG,
      expected: [
        { id: "n1", note: 60, startBeat: 0, durationBeats: 1, hand: "right", finger: 1, chordGroupId: null, voice: "melody" },
        { id: "n2", note: 62, startBeat: 1, durationBeats: 1, hand: "right", finger: 2, chordGroupId: null, voice: "melody" },
        { id: "n3", note: 64, startBeat: 2, durationBeats: 1, hand: "right", finger: 3, chordGroupId: null, voice: "melody" },
        { id: "n4", note: 65, startBeat: 3, durationBeats: 1, hand: "right", finger: 4, chordGroupId: null, voice: "melody" },
        { id: "n5", note: 67, startBeat: 4, durationBeats: 1, hand: "right", finger: 5, chordGroupId: null, voice: "melody" },
        { id: "n6", note: 67, startBeat: 5, durationBeats: 1, hand: "right", finger: 5, chordGroupId: null, voice: "melody" },
        { id: "n7", note: 65, startBeat: 6, durationBeats: 1, hand: "right", finger: 4, chordGroupId: null, voice: "melody" },
        { id: "n8", note: 64, startBeat: 7, durationBeats: 1, hand: "right", finger: 3, chordGroupId: null, voice: "melody" },
        { id: "n9", note: 62, startBeat: 8, durationBeats: 1, hand: "right", finger: 2, chordGroupId: null, voice: "melody" },
        { id: "n10", note: 60, startBeat: 9, durationBeats: 1, hand: "right", finger: 1, chordGroupId: null, voice: "melody" },
      ],
    },
  },
  {
    id: "gym-cmaj-triad",
    label: "C Major Triad",
    description: "Play C, E, and G together as one chord.",
    exercise: {
      exerciseId: "gym-cmaj-triad",
      tempoBpm: 70,
      difficulty: "intermediate",
      ...ELEMENTARY_CONFIG,
      expected: [
        { id: "n1", note: 60, startBeat: 0, durationBeats: 2, hand: "right", finger: 1, chordGroupId: "gym-cmaj", voice: "chord" },
        { id: "n2", note: 64, startBeat: 0, durationBeats: 2, hand: "right", finger: 3, chordGroupId: "gym-cmaj", voice: "chord" },
        { id: "n3", note: 67, startBeat: 0, durationBeats: 2, hand: "right", finger: 5, chordGroupId: "gym-cmaj", voice: "chord" },
      ],
    },
  },
  {
    id: "gym-amin-triad",
    label: "A Minor Triad",
    description: "Play A, C, and E together as one chord.",
    exercise: {
      exerciseId: "gym-amin-triad",
      tempoBpm: 70,
      difficulty: "intermediate",
      ...ELEMENTARY_CONFIG,
      expected: [
        { id: "n1", note: 57, startBeat: 0, durationBeats: 2, hand: "right", finger: 1, chordGroupId: "gym-amin", voice: "chord" },
        { id: "n2", note: 60, startBeat: 0, durationBeats: 2, hand: "right", finger: 3, chordGroupId: "gym-amin", voice: "chord" },
        { id: "n3", note: 64, startBeat: 0, durationBeats: 2, hand: "right", finger: 5, chordGroupId: "gym-amin", voice: "chord" },
      ],
    },
  },
  {
    id: "gym-c-g-interval",
    label: "C-G Interval Drill",
    description: "Play C and G together as a fifth, twice in a row.",
    exercise: {
      exerciseId: "gym-c-g-interval",
      tempoBpm: 70,
      difficulty: "intermediate",
      ...ELEMENTARY_CONFIG,
      expected: [
        { id: "n1", note: 60, startBeat: 0, durationBeats: 2, hand: "right", finger: 1, chordGroupId: "gym-fifth-1", voice: "chord" },
        { id: "n2", note: 67, startBeat: 0, durationBeats: 2, hand: "right", finger: 5, chordGroupId: "gym-fifth-1", voice: "chord" },
        { id: "n3", note: 60, startBeat: 3, durationBeats: 2, hand: "right", finger: 1, chordGroupId: "gym-fifth-2", voice: "chord" },
        { id: "n4", note: 67, startBeat: 3, durationBeats: 2, hand: "right", finger: 5, chordGroupId: "gym-fifth-2", voice: "chord" },
      ],
    },
  },
];
