import { describe, expect, it } from "vitest";
import {
  Deck,
  MAX_RETRIES,
  buildDeck,
  focusPool,
  isBlack,
  makeCard,
  median,
  midiName,
  noteLabel,
  parseNoteName,
  pitchPool,
  summarise,
  vexKeyFor,
  type Answer,
} from "./noteReadingDeck";

/** Small deterministic generator so the shuffles are repeatable. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("pitch pools", () => {
  it("C position is five white keys per clef, and gains the black keys between them with accidentals", () => {
    const natural = pitchPool({ clef: "treble", range: "c-position", accidentals: false });
    expect(natural.map((p) => p.midi)).toEqual([60, 62, 64, 65, 67]);
    const chromatic = pitchPool({ clef: "treble", range: "c-position", accidentals: true });
    expect(chromatic.map((p) => p.midi)).toEqual([60, 61, 62, 63, 64, 65, 66, 67]);
    expect(pitchPool({ clef: "bass", range: "c-position", accidentals: false }).map((p) => p.midi)).toEqual([48, 50, 52, 53, 55]);
  });

  it("the ledger range reaches two ledger lines either side of each staff", () => {
    const treble = pitchPool({ clef: "treble", range: "ledger", accidentals: false }).map((p) => p.midi);
    expect(Math.min(...treble)).toBe(57); // A3, second ledger line below
    expect(Math.max(...treble)).toBe(84); // C6, second ledger line above
    const bass = pitchPool({ clef: "bass", range: "ledger", accidentals: false }).map((p) => p.midi);
    expect(Math.min(...bass)).toBe(36); // C2
    expect(Math.max(...bass)).toBe(64); // E4
  });

  it("both clefs pool the two staves, each pitch tagged with its clef", () => {
    const both = pitchPool({ clef: "both", range: "octave", accidentals: false });
    expect(both.filter((p) => p.clef === "treble")).toHaveLength(7);
    expect(both.filter((p) => p.clef === "bass")).toHaveLength(7);
  });
});

describe("note names", () => {
  it("spells black keys as sharps or flats on request", () => {
    expect(vexKeyFor(61, "sharp")).toBe("c#/4");
    expect(vexKeyFor(61, "flat")).toBe("db/4");
    expect(vexKeyFor(70, "flat")).toBe("bb/4");
    expect(vexKeyFor(60, "natural")).toBe("c/4");
  });

  it("round-trips names, including flats", () => {
    for (let midi = 24; midi <= 96; midi += 1) expect(parseNoteName(midiName(midi))).toBe(midi);
    expect(parseNoteName("Bb3")).toBe(58);
    expect(parseNoteName("Db4")).toBe(61);
    expect(parseNoteName("H4")).toBeNull();
  });

  it("labels a flat-spelled card with its own accidental", () => {
    const card = { midi: 63, spelling: "flat" as const };
    expect(noteLabel(card)).toBe("Eb4");
  });
});

describe("deck building", () => {
  const pool = pitchPool({ clef: "treble", range: "octave", accidentals: true });

  it("draws the requested number, never the same card twice running, and covers the pool evenly", () => {
    const deck = buildDeck(pool, 24, seeded(1));
    expect(deck).toHaveLength(24);
    for (let i = 1; i < deck.length; i += 1) expect(deck[i].midi).not.toBe(deck[i - 1].midi);
    const counts = new Map<number, number>();
    for (const card of deck) counts.set(card.midi, (counts.get(card.midi) ?? 0) + 1);
    expect(new Set(counts.values())).toEqual(new Set([2])); // 24 cards over 12 pitches
  });

  it("spells every black key as a sharp or a flat, and white keys plain", () => {
    for (const card of buildDeck(pool, 40, seeded(7))) {
      expect(card.spelling === "natural").toBe(!isBlack(card.midi));
      expect(card.vexKey).toBe(vexKeyFor(card.midi, card.spelling));
    }
  });

  it("does not repeat across a refill boundary", () => {
    const first = buildDeck(pool, 5, seeded(3));
    const next = buildDeck(pool, 5, seeded(4), first[first.length - 1]);
    expect(next[0].midi).not.toBe(first[first.length - 1].midi);
  });

  it("a focus pool uses the clef each pitch belongs to", () => {
    expect(focusPool([53, 53, 67], "both")).toEqual([
      { midi: 53, clef: "bass" },
      { midi: 67, clef: "treble" },
    ]);
    expect(focusPool([53], "treble")).toEqual([{ midi: 53, clef: "treble" }]);
  });
});

describe("spaced-repetition deck", () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => makeCard(60 + i, "treble", () => 0));

  it("a correct answer just moves on", () => {
    const deck = new Deck(cards(3), () => 0);
    deck.answer(true);
    expect(deck.remaining).toBe(2);
  });

  it("a miss comes back three to five cards later", () => {
    const list = cards(10);
    const deck = new Deck(list, () => 0); // rng 0 → gap 3
    deck.answer(false);
    const order: string[] = [];
    while (deck.current) {
      order.push(deck.current.id);
      deck.answer(true);
    }
    expect(order.indexOf(list[0].id)).toBe(3); // three other cards come first
    const late = new Deck(list, () => 0.99); // gap 5
    late.answer(false);
    const lateOrder: string[] = [];
    while (late.current) {
      lateOrder.push(late.current.id);
      late.answer(true);
    }
    expect(lateOrder.indexOf(list[0].id)).toBe(5);
  });

  it("a miss in a short deck goes to the end, and a card is re-asked at most MAX_RETRIES times", () => {
    const list = cards(2);
    const deck = new Deck(list, () => 0.5);
    let asks = 0;
    while (deck.current && asks < 50) {
      asks += deck.current.id === list[0].id ? 1 : 0;
      deck.answer(false);
    }
    expect(asks).toBe(1 + MAX_RETRIES);
    expect(deck.remaining).toBe(0);
  });
});

describe("round summary", () => {
  const card = (midi: number) => makeCard(midi, "treble", () => 0);
  const answer = (midi: number, correct: boolean, ms: number, first = true): Answer => ({
    card: card(midi),
    pressed: correct ? midi : midi + 1,
    correct,
    ms,
    first,
  });

  it("counts accuracy by first answers and ignores re-asks", () => {
    const summary = summarise([answer(60, true, 800), answer(62, false, 2000), answer(62, true, 900, false), answer(64, true, 1000)]);
    expect(summary.total).toBe(3);
    expect(summary.correct).toBe(2);
    expect(summary.accuracy).toBeCloseTo(2 / 3);
    expect(summary.medianMs).toBe(1000); // median of 800, 2000, 1000
  });

  it("lists the slowest pitches first by median time over every ask", () => {
    const summary = summarise([
      answer(60, true, 600),
      answer(65, true, 3000),
      answer(57, true, 2000),
      answer(57, true, 2400, false),
      answer(62, true, 900),
    ]);
    expect(summary.slowest.map((note) => note.note)).toEqual(["F4", "A3", "D4"]);
    expect(summary.slowest[1].medianMs).toBe(2200);
  });

  it("is empty-safe", () => {
    expect(summarise([])).toEqual({ correct: 0, total: 0, accuracy: 0, medianMs: 0, slowest: [] });
    expect(median([])).toBe(0);
  });
});
