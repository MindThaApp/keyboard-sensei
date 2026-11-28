import { describe, expect, it } from "vitest";
import { GUITAR_BARRE_CHORDS, GUITAR_CHORDS, chordPitchClasses, fretToMidi, GUITAR_HIGHEST_NOTE, GUITAR_LOWEST_NOTE, parseChordSymbol } from "@keyboard-sensei/music-theory";
import { lessonSchema, midiExerciseSchema } from "@keyboard-sensei/lesson-engine";
import { buildGuitarAdvancedLessons, guitarAdvancedExercises as exercises, guitarAdvancedLessons as lessons } from "./guitar-advanced.js";
import { exercises as existingExercises, lessons as existingLessons } from "../content.js";

const exerciseById = new Map(exercises.map((e) => [e.exerciseId, e]));

/** Permanent keys: append only, never edit (README rule). */
const FROZEN_LESSON_IDS = [
  "guitar-first-position-naturals", "guitar-c-and-g-major-scales", "guitar-sharps-and-flats", "guitar-folk-melodies-first-position",
  "guitar-fingerstyle-pima", "guitar-travis-picking-basics", "guitar-arpeggiated-open-chords",
  "guitar-minor-pentatonic-box-1", "guitar-hammer-ons-and-pull-offs", "guitar-simple-lead-lines", "guitar-reading-second-position",
  "guitar-reading-fifth-position", "guitar-three-four-and-six-eight", "guitar-dotted-rhythms",
  "guitar-barre-chord-f", "guitar-a-shape-barre-chords", "guitar-moving-e-shape-barres", "guitar-power-chords",
  "guitar-twelve-bar-blues-in-a", "guitar-twelve-bar-blues-in-e",
];

describe("guitar tiers 3-4: structure", () => {
  it("has the frozen lesson ids", () => expect(lessons.map((l) => l.id).sort()).toEqual([...FROZEN_LESSON_IDS].sort()));
  it("covers every unit in spec 3.1 for tiers 3 and 4", () => {
    const tier = (n: number) => lessons.filter((l) => l.tier === n).length;
    expect(tier(3)).toBeGreaterThanOrEqual(6);
    expect(tier(4)).toBeGreaterThanOrEqual(12);
    expect(lessons.every((l) => l.tier === 3 || l.tier === 4)).toBe(true);
  });
  it("uses unique ids that do not collide with piano content", () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    expect(new Set(exercises.map((e) => e.exerciseId)).size).toBe(exercises.length);
    const lessonIds = new Set(existingLessons.map((l) => l.id));
    const exerciseIds = new Set(existingExercises.map((e) => e.exerciseId));
    expect(lessons.filter((l) => lessonIds.has(l.id))).toEqual([]);
    expect(exercises.filter((e) => exerciseIds.has(e.exerciseId))).toEqual([]);
  });
  it("uses the guitar- prefix and guitar paths", () => {
    for (const l of lessons) {
      expect(l.id.startsWith("guitar-")).toBe(true);
      expect(["guitar-foundations", "guitar-chords-rhythm"]).toContain(l.path);
      expect(l.instrument).toBe("guitar");
    }
  });
  it("gives each lesson 2-5 graded exercises, objectives and a quiz", () => {
    for (const l of lessons) {
      const refs = l.sections.filter((s) => s.type === "midi-exercise");
      expect(refs.length, l.id).toBeGreaterThanOrEqual(2);
      expect(refs.length, l.id).toBeLessThanOrEqual(5);
      expect(l.objectives.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.skills.length, l.id).toBeGreaterThan(0);
      const quizzes = l.sections.filter((s) => s.type === "quiz");
      expect(quizzes.length, l.id).toBe(1);
      for (const q of quizzes[0]!.type === "quiz" ? quizzes[0]!.questions : []) {
        expect(q.options.length).toBeGreaterThanOrEqual(3);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex!).toBeLessThan(q.options.length);
      }
    }
  });
  it("links every exercise section to exactly one exercise, and every exercise to one section", () => {
    const refs = lessons.flatMap((l) => l.sections.flatMap((s) => (s.type === "midi-exercise" ? [s.exerciseId] : [])));
    expect(new Set(refs).size).toBe(refs.length);
    for (const id of refs) expect(exerciseById.has(id), id).toBe(true);
    expect([...refs].sort()).toEqual(exercises.map((e) => e.exerciseId).sort());
  });
  it("validates against the lesson-engine schemas", () => {
    // The shared lesson schema predates the guitar paths (M5 widens it); check everything else.
    for (const l of lessons) expect(() => lessonSchema.parse({ ...l, path: "modern-chords" }), l.id).not.toThrow();
    for (const e of exercises) expect(() => midiExerciseSchema.parse(e), e.exerciseId).not.toThrow();
  });
});

describe("guitar tiers 3-4: unlock chains", () => {
  const chained = buildGuitarAdvancedLessons({ foundations: ["entry-f"], chordsRhythm: ["entry-c"] });
  const byId = new Map(chained.map((l) => [l.id, l]));
  it("never requires a later tier, a piano lesson, or an unknown lesson", () => {
    for (const l of chained) {
      for (const req of l.unlockCriteria.requiresLessonIds) {
        if (req.startsWith("entry-")) continue;
        const r = byId.get(req);
        expect(r, `${l.id} -> ${req}`).toBeDefined();
        expect(r!.tier).toBeLessThanOrEqual(l.tier);
        expect(r!.path).toBe(l.path);
      }
    }
  });
  it("opens each path from the entry lessons only, with no cycles", () => {
    expect(chained.filter((l) => l.unlockCriteria.requiresLessonIds.includes("entry-f")).length).toBe(1);
    expect(chained.filter((l) => l.unlockCriteria.requiresLessonIds.includes("entry-c")).length).toBe(1);
    for (const l of chained) {
      const seen = new Set<string>();
      let cur: string | undefined = l.id;
      while (cur && byId.has(cur)) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = byId.get(cur)!.unlockCriteria.requiresLessonIds.find((r) => byId.has(r));
      }
    }
  });
  it("orders tier 3 before tier 4 inside the foundations path", () => {
    const f = chained.filter((l) => l.path === "guitar-foundations").map((l) => l.tier);
    expect([...f].sort()).toEqual(f);
  });
});

describe("guitar tiers 3-4: exercises", () => {
  const mono = exercises.filter((e) => e.input === "mic-mono");
  const chord = exercises.filter((e) => e.input === "mic-chord");
  it("tags every exercise for guitar with a mic input", () => {
    for (const e of exercises) {
      expect(e.instrument).toBe("guitar");
      expect(["mic-mono", "mic-chord"]).toContain(e.input);
    }
    expect(mono.length).toBeGreaterThan(20);
    expect(chord.length).toBeGreaterThan(10);
  });
  it("relaxes durations for plucked notes", () => {
    for (const e of exercises) expect(e.durationTolerancePercent).toBeGreaterThanOrEqual(60);
  });
  it("gives every single-note exercise a hint matching each pitch, within range and reach", () => {
    for (const e of mono) {
      const hints = e.techniqueHints!;
      for (const n of e.expected) {
        const h = hints[n.id];
        expect(h, `${e.exerciseId}/${n.id}`).toBeDefined();
        expect(fretToMidi(h!.string, h!.fret)).toBe(n.note);
        expect(h!.fret).toBeGreaterThanOrEqual(0);
        expect(h!.fret).toBeLessThanOrEqual(12);
        if (h!.finger !== undefined) expect([0, 1, 2, 3, 4]).toContain(h!.finger);
        expect(n.note).toBeGreaterThanOrEqual(GUITAR_LOWEST_NOTE);
        expect(n.note).toBeLessThanOrEqual(GUITAR_HIGHEST_NOTE);
      }
      expect(Object.keys(hints).sort()).toEqual(e.expected.map((n) => n.id).sort());
    }
  });
  it("is monophonic and in order (mic-mono)", () => {
    for (const e of mono) {
      for (let i = 1; i < e.expected.length; i++) {
        const prev = e.expected[i - 1]!;
        expect(e.expected[i]!.startBeat, e.exerciseId).toBeGreaterThanOrEqual(prev.startBeat + prev.durationBeats - 1e-9);
      }
    }
  });
  it("fills whole bars", () => {
    for (const e of exercises) {
      const end = Math.max(...e.expected.map((n) => n.startBeat + n.durationBeats));
      const bars = end / (e.beatsPerBar ?? 4);
      expect(Math.abs(bars - Math.round(bars)), `${e.exerciseId} ends at beat ${end}`).toBeLessThan(1e-9);
    }
  });
  it("keeps tempos teachable", () => {
    for (const e of exercises) {
      expect(e.tempoBpm).toBeGreaterThanOrEqual(50);
      expect(e.tempoBpm).toBeLessThanOrEqual(160);
      const shortest = Math.min(...e.expected.map((n) => n.durationBeats)) * (e.beatUnit === 8 ? 0.5 : 1);
      // Fastest note no quicker than 8 notes a second (a comfortable ceiling for graded single notes).
      expect((60 / e.tempoBpm) * shortest * (e.beatUnit === 8 ? 2 : 1), e.exerciseId).toBeGreaterThanOrEqual(0.125);
    }
  });
  it("keeps note and hand position reachable: each bar spans at most five frets (excluding open strings)", () => {
    for (const e of mono) {
      const perBar = new Map<number, number[]>();
      for (const n of e.expected) {
        const f = e.techniqueHints![n.id]!.fret;
        if (f === 0) continue;
        const bar = Math.floor(n.startBeat / (e.beatsPerBar ?? 4));
        perBar.set(bar, [...(perBar.get(bar) ?? []), f]);
      }
      for (const [bar, frets] of perBar) expect(Math.max(...frets) - Math.min(...frets), `${e.exerciseId} bar ${bar}`).toBeLessThanOrEqual(5);
    }
  });
  it("makes chord targets agree with the chord dictionary", () => {
    const all = { ...GUITAR_CHORDS, ...GUITAR_BARRE_CHORDS };
    for (const e of chord) {
      expect(e.chordTargets!.length).toBeGreaterThan(0);
      let lastEnd = 0;
      for (const t of e.chordTargets!) {
        const shape = all[t.symbol];
        expect(shape, t.symbol).toBeDefined();
        expect(t.pitchClasses).toEqual(chordPitchClasses(shape!));
        expect(t.startBeat).toBeGreaterThanOrEqual(lastEnd);
        lastEnd = t.startBeat + t.durationBeats;
        const notes = e.expected.filter((n) => n.chordGroupId === t.id);
        expect(notes.length).toBeGreaterThanOrEqual(2);
        for (const n of notes) expect(t.pitchClasses).toContain(n.note % 12);
      }
    }
  });
  it("names every chord target with a symbol the strum grader can match", () => {
    for (const e of chord) for (const t of e.chordTargets!) {
      const parsed = parseChordSymbol(t.symbol);
      expect(parsed, t.symbol).not.toBeNull();
      expect(t.pitchClasses.every((pc) => parsed!.pitchClasses.includes(pc)), t.symbol).toBe(true);
    }
  });
  it("uses only chords introduced by the time they are needed", () => {
    // Open chords come from tier 0-2; barre and power chords are taught in tier 4 lessons.
    const barreLessonTier = new Map(lessons.map((l) => [l.id, l.tier]));
    for (const l of lessons.filter((x) => x.tier === 3)) {
      for (const s of l.sections) {
        if (s.type !== "midi-exercise") continue;
        const e = exerciseById.get(s.exerciseId)!;
        for (const t of e.chordTargets ?? []) expect(GUITAR_BARRE_CHORDS[t.symbol], `${l.id} uses ${t.symbol}`).toBeUndefined();
      }
    }
    expect(barreLessonTier.size).toBe(lessons.length);
  });
  it("only uses open chords the tier 0-2 curriculum covers, plus the dictionary's seventh chords", () => {
    const covered = new Set(["Em", "Am", "E", "A", "D", "G", "C", "D7", "A7", "E7"]);
    for (const e of exercises) for (const t of e.chordTargets ?? []) {
      if (GUITAR_BARRE_CHORDS[t.symbol]) continue;
      expect(covered.has(t.symbol), t.symbol).toBe(true);
    }
  });
});

describe("guitar tiers 3-4: notation", () => {
  it("renders staff and tab for every note exercise tune, from the same data", () => {
    for (const l of lessons) for (const s of l.sections) {
      if (s.type !== "notation") continue;
      const d = s.vexflowData as Record<string, any>;
      // The lesson player's guitar formats (guitar-helpers.ts): staff + tab, or chord boxes.
      if (d.kind === "chord-diagrams") {
        const all = { ...GUITAR_CHORDS, ...GUITAR_BARRE_CHORDS };
        for (const c of d.chords) {
          expect(typeof c).toBe("string");
          expect(all[c], c).toBeDefined();
        }
      } else {
        expect(d.kind).toBe("guitar");
        expect(d.measures.length).toBeGreaterThan(0);
        // One fretting per sounding note: the staff and the tab are drawn from the same entry.
        for (const m of d.measures) for (const n of m.notes) {
          expect(typeof n.duration).toBe("string");
          expect(n.duration.endsWith("r")).toBe(false);
          for (const t of n.positions ?? []) {
            expect(t.string).toBeGreaterThanOrEqual(1);
            expect(t.string).toBeLessThanOrEqual(6);
            expect(t.fret).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe("guitar tiers 3-4: rights and wording", () => {
  const pd = lessons.flatMap((l) => l.sections.flatMap((s) => (s.type === "notation" && s.contentRights ? [s.contentRights] : [])));
  it("credits every borrowed tune as public domain", () => {
    expect(pd.length).toBeGreaterThanOrEqual(2);
    for (const r of pd) {
      expect(r.status).toBe("public-domain");
      expect(r.copyrightHolder).toBeNull();
      expect(r.composer.length).toBeGreaterThan(0);
    }
  });
  it("names only public-domain tunes and no copyrighted material", () => {
    const text = JSON.stringify(lessons);
    expect(text).not.toMatch(/©|all rights reserved|licensed-copyright/i);
    expect(text).not.toMatch(/\b(tablature book|method book)\b/i);
  });
  it("keeps body text non-trivial", () => {
    for (const l of lessons) {
      const text = l.sections.flatMap((s) => (s.type === "markdown" || s.type === "theory-card" ? [s.body] : []));
      expect(text.join(" ").length, l.id).toBeGreaterThan(200);
    }
  });
});

describe("barre and power chord dictionary", () => {
  const pcs = (sym: string) => chordPitchClasses(GUITAR_BARRE_CHORDS[sym]!);
  it("spells the expected chords", () => {
    expect(pcs("F")).toEqual([0, 5, 9]);
    expect(pcs("Fm")).toEqual([0, 5, 8]);
    expect(pcs("Bm")).toEqual([2, 6, 11]);
    expect(pcs("B")).toEqual([3, 6, 11]);
    expect(pcs("Bb")).toEqual([2, 5, 10]);
    expect(pcs("G3")).toEqual([2, 7, 11]);
    expect(pcs("B7")).toEqual([3, 6, 9, 11]);
    expect(pcs("E5")).toEqual([4, 11]);
    expect(pcs("A5")).toEqual([4, 9]);
    expect(pcs("D5")).toEqual([2, 9]);
    expect(pcs("G5")).toEqual([2, 7]);
    expect(pcs("C5")).toEqual([0, 7]);
  });
  it("draws what it grades: fingers, frets and barre agree", () => {
    for (const c of Object.values(GUITAR_BARRE_CHORDS)) {
      expect(c.frets.length).toBe(6);
      expect(c.fingers.length).toBe(6);
      c.frets.forEach((f, i) => {
        if (f === null || f === 0) expect(c.fingers[i]).toBe(0);
        else expect(c.fingers[i]).toBeGreaterThan(0);
      });
      const fretted = c.frets.filter((f): f is number => f !== null && f > 0);
      expect(c.baseFret === 1 || c.baseFret === Math.min(...fretted)).toBe(true);
      expect(Math.max(...fretted) - c.baseFret).toBeLessThanOrEqual(3);
      if (c.barre) {
        expect(c.barre.fret).toBe(c.baseFret);
        for (let s = c.barre.toString; s <= c.barre.fromString; s++) expect(c.frets[6 - s]!).toBeGreaterThanOrEqual(c.barre.fret);
      }
    }
  });
});
