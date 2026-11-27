import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import type { Lesson, LessonSection, NotationSection } from "@keyboard-sensei/shared-types";
import { exercises as existingExercises, lessons as existingLessons } from "../content.js";
import { midi } from "./build.js";
import { violinTier34Exercises, violinTier34Lessons, type ViolinExercise } from "./violin-tier34.js";

const ENTRY = "violin-tier-2-last";
const lessons = violinTier34Lessons([ENTRY]);
const exerciseById = new Map(violinTier34Exercises.map((exercise) => [exercise.exerciseId, exercise]));
const exerciseIdsOf = (lesson: Lesson) => lesson.sections.flatMap((s) => (s.type === "midi-exercise" ? [s.exerciseId] : []));
const notationOf = (lesson: Lesson) => lesson.sections.filter((s): s is NotationSection => s.type === "notation");

const OPEN: Record<string, number> = { G: 55, D: 62, A: 69, E: 76 };
/** Semitones above the open string for each finger in first position (low/high placements, extended reach). */
const FIRST_POSITION: Record<number, number[]> = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8] };
/** A position higher moves every finger up by one or two semitones. */
const reachable = (finger: number, position: number, offset: number): boolean =>
  finger === 0
    ? offset === 0
    : FIRST_POSITION[finger]!.some((base) => offset >= base + (position - 1) && offset <= base + 2 * (position - 1));

describe("violin tier 3-4 content", () => {
  it("has the tier 3 and 4 lessons from the curriculum, with violin-prefixed unique ids", () => {
    expect(lessons.length).toBeGreaterThanOrEqual(12);
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    for (const lesson of lessons) {
      expect(lesson.id).toMatch(/^violin-/);
      expect(lesson.instrument).toBe("violin");
      expect([3, 4]).toContain(lesson.tier);
      expect(lesson.skills.length).toBeGreaterThan(0);
    }
    expect(lessons.some((l) => l.tier === 3)).toBe(true);
    expect(lessons.some((l) => l.tier === 4)).toBe(true);
    // Curriculum units from spec 3.2.
    const ids = lessons.map((l) => l.id).join(" ");
    for (const unit of ["two-octaves", "fourth-finger", "minor", "tone", "dynamics", "shifting", "third-position", "vibrato", "double-stops", "ode-to-joy", "minuet"]) {
      expect(ids).toContain(unit);
    }
  });

  it("never collides with an existing lesson or exercise id", () => {
    const taken = new Set([...existingLessons.map((l) => l.id), ...existingExercises.map((e) => e.exerciseId)]);
    for (const lesson of lessons) expect(taken.has(lesson.id)).toBe(false);
    for (const exercise of violinTier34Exercises) expect(taken.has(exercise.exerciseId)).toBe(false);
    expect(new Set(violinTier34Exercises.map((e) => e.exerciseId)).size).toBe(violinTier34Exercises.length);
  });

  it("passes the lesson and exercise schemas", () => {
    // The lesson schema's `path` list is extended by the violin branch; check the rest against a known path.
    for (const lesson of lessons) expect(() => validateLesson({ ...lesson, path: "classical-technical" })).not.toThrow();
    for (const exercise of violinTier34Exercises) expect(() => validateMidiExercise(exercise)).not.toThrow();
    for (const lesson of lessons) expect(lesson.path).toBe("violin-technique");
  });

  it("forms one linear unlock chain from the tier 2 entry, never going back to an earlier tier", () => {
    lessons.forEach((lesson, index) => {
      expect(lesson.unlockCriteria.minScore).toBe(70);
      expect(lesson.unlockCriteria.requiresLessonIds).toEqual([index === 0 ? ENTRY : lessons[index - 1]!.id]);
      if (index > 0) expect(lessons[index - 1]!.tier).toBeLessThanOrEqual(lesson.tier);
    });
    expect(lessons.map((l) => l.tier)).toEqual([...lessons.map((l) => l.tier)].sort());
  });

  it("gives every lesson 2-5 graded exercises, objectives and a sensible estimate", () => {
    for (const lesson of lessons) {
      const ids = exerciseIdsOf(lesson);
      expect(ids.length, lesson.id).toBeGreaterThanOrEqual(lesson.id.includes("checkpoint") ? 3 : 2);
      expect(ids.length, lesson.id).toBeLessThanOrEqual(5);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(exerciseById.has(id), `${lesson.id} -> ${id}`).toBe(true);
      expect(lesson.objectives.length).toBeGreaterThanOrEqual(2);
      expect(lesson.estimatedMinutes).toBeGreaterThanOrEqual(5);
      expect(lesson.sections.some((s) => s.type === "markdown")).toBe(true);
    }
    // Every exercise is used by exactly one lesson.
    const used = lessons.flatMap(exerciseIdsOf);
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual(violinTier34Exercises.map((e) => e.exerciseId).sort());
  });

  it("uses unique quiz question ids with a valid answer", () => {
    const ids: string[] = [];
    for (const lesson of lessons) {
      for (const section of lesson.sections) {
        if (section.type !== "quiz") continue;
        for (const q of section.questions) {
          ids.push(q.id);
          expect(q.correctIndex).toBeLessThan(q.options.length);
          expect(new Set(q.options).size).toBe(q.options.length);
        }
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("violin exercises", () => {
  const tierOfExercise = (exercise: ViolinExercise) => lessons.find((l) => exerciseIdsOf(l).includes(exercise.exerciseId))!.tier;

  it("are mic-graded violin exercises with the spec's intonation tolerances", () => {
    for (const exercise of violinTier34Exercises) {
      expect(exercise.instrument).toBe("violin");
      expect(exercise.input).toBe("mic-mono");
      expect(exercise.intonationToleranceCents).toBe(tierOfExercise(exercise) === 3 ? 20 : 15);
      // Bowed notes are not exactly as long as written, so duration stays lenient.
      expect(exercise.durationTolerancePercent).toBeGreaterThanOrEqual(50);
      expect(exercise.tempoBpm).toBeGreaterThanOrEqual(48);
      expect(exercise.tempoBpm).toBeLessThanOrEqual(130);
    }
  });

  it("are monophonic and gapless, starting at beat 0, with unique note ids", () => {
    for (const exercise of violinTier34Exercises) {
      const notes = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
      expect(notes[0]!.startBeat).toBe(0);
      notes.forEach((n, i) => {
        if (i > 0) expect(n.startBeat, exercise.exerciseId).toBeCloseTo(notes[i - 1]!.startBeat + notes[i - 1]!.durationBeats, 9);
      });
      expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
      const bar = exercise.beatsPerBar ?? 4;
      const total = notes.at(-1)!.startBeat + notes.at(-1)!.durationBeats;
      // Scales and tunes end on a whole bar, except two that finish with a long note inside the last bar.
      expect(total % bar === 0 || exercise.exerciseId.includes("one-at-a-time"), `${exercise.exerciseId} length ${total}`).toBe(true);
    }
  });

  it("stay inside the violin range and the sounding-pitch convention (G3 to E7)", () => {
    for (const exercise of violinTier34Exercises) {
      for (const n of exercise.expected) {
        expect(n.note, exercise.exerciseId).toBeGreaterThanOrEqual(55);
        expect(n.note, exercise.exerciseId).toBeLessThanOrEqual(100);
      }
    }
  });

  it("carry a playable fingering hint for every note", () => {
    for (const exercise of violinTier34Exercises) {
      expect(Object.keys(exercise.techniqueHints).sort()).toEqual(exercise.expected.map((n) => n.id).sort());
      for (const n of exercise.expected) {
        const hint = exercise.techniqueHints[n.id]!;
        expect(["G", "D", "A", "E"]).toContain(hint.string);
        expect(hint.finger).toBeGreaterThanOrEqual(0);
        expect(hint.finger).toBeLessThanOrEqual(4);
        expect(hint.position).toBeGreaterThanOrEqual(1);
        expect(hint.position).toBeLessThanOrEqual(7);
        const offset = n.note - OPEN[hint.string]!;
        expect(
          reachable(hint.finger, hint.finger === 0 ? 1 : hint.position, offset),
          `${exercise.exerciseId} ${n.id}: pitch ${n.note} on ${hint.string} with finger ${hint.finger} in position ${hint.position} (offset ${offset})`,
        ).toBe(true);
      }
    }
  });

  it("alternate bows, repeating a bow only inside a slur", () => {
    for (const exercise of violinTier34Exercises) {
      const bows = exercise.expected.map((n) => exercise.techniqueHints[n.id]!.bow);
      expect(bows[0]).toBe("down");
      expect(bows.every((b) => b === "down" || b === "up")).toBe(true);
    }
  });

  it("keeps tier 3 in first position and tier 4 to first and third", () => {
    for (const exercise of violinTier34Exercises) {
      const positions = new Set(exercise.expected.filter((n) => exercise.techniqueHints[n.id]!.finger !== 0).map((n) => exercise.techniqueHints[n.id]!.position));
      if (tierOfExercise(exercise) === 3) expect([...positions], exercise.exerciseId).toEqual([1].filter((p) => positions.has(p)));
      else for (const p of positions) expect([1, 3], exercise.exerciseId).toContain(p);
    }
    const third = violinTier34Exercises.filter((e) => e.expected.some((n) => e.techniqueHints[n.id]!.position === 3 && e.techniqueHints[n.id]!.finger !== 0));
    expect(third.length).toBeGreaterThanOrEqual(5);
  });

  it("only shifts on a note that has a fingered target, at most one position step of 1 to 3", () => {
    for (const exercise of violinTier34Exercises) {
      let previous = 1;
      for (const n of exercise.expected) {
        const hint = exercise.techniqueHints[n.id]!;
        if (hint.finger === 0) continue;
        expect(Math.abs(hint.position - previous)).toBeLessThanOrEqual(2);
        previous = hint.position;
      }
    }
  });
});

describe("violin notation and rights", () => {
  it("renders each notation section from its exercise: same notes, same fingering", () => {
    let checked = 0;
    for (const lesson of lessons) {
      for (const section of notationOf(lesson)) {
        const data = section.vexflowData as { exerciseId: string; instrument: string; clef: string; notes: Array<{ keys: string[]; duration: string; fingering: { string: string; finger: number; position: number } }> };
        const exercise = exerciseById.get(data.exerciseId)!;
        expect(exercise, `${lesson.id}: ${data.exerciseId}`).toBeDefined();
        expect(data.instrument).toBe("violin");
        expect(data.clef).toBe("treble");
        expect(data.notes.length).toBe(exercise.expected.length);
        data.notes.forEach((n, i) => {
          const event = exercise.expected[i]!;
          const m = /^([a-g])(##|bb|#|b)?\/(-?\d)$/.exec(n.keys[0]!)!;
          expect(midi(`${m[1]!.toUpperCase()}${m[2] ?? ""}${m[3]}`)).toBe(event.note);
          const hint = exercise.techniqueHints[event.id]!;
          expect([n.fingering.string, n.fingering.finger, n.fingering.position]).toEqual([hint.string, hint.finger, hint.position]);
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it("credits every notation section, with original or public-domain material only", () => {
    for (const lesson of lessons) {
      for (const section of notationOf(lesson)) {
        const rights = section.contentRights;
        expect(rights, lesson.id).toBeDefined();
        expect(["original", "public-domain"]).toContain(rights!.status);
        expect(rights!.copyrightHolder).toBeNull();
        expect(rights!.licenseReference).toBeNull();
        if (rights!.status === "public-domain") expect(rights!.composer.length).toBeGreaterThan(0);
      }
    }
    const publicDomain = lessons.flatMap(notationOf).filter((s) => s.contentRights!.status === "public-domain");
    expect(publicDomain.length).toBeGreaterThanOrEqual(5);
  });

  it("names no method book or copyrighted repertoire", () => {
    const text = JSON.stringify(lessons).toLowerCase();
    for (const banned of ["suzuki", "wohlfahrt", "sevcik", "kayser", "mazas", "schradieck", "all for strings", "essential elements"]) {
      expect(text.includes(banned), banned).toBe(false);
    }
  });

  it("only lists notation sections as non-empty with valid duration codes", () => {
    const ok = new Set(["16", "8", "8d", "q", "qd", "h", "hd", "w"]);
    for (const lesson of lessons) {
      for (const section of notationOf(lesson) as LessonSection[]) {
        const data = (section as NotationSection).vexflowData as { notes: Array<{ duration: string }> };
        expect(data.notes.length).toBeGreaterThan(0);
        for (const n of data.notes) expect(ok.has(n.duration)).toBe(true);
      }
    }
  });
});
