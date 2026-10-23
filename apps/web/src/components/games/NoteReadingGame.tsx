import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Chip, ErrorState, SegmentedControl, Sheet } from "../ui";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { useFocusMode } from "../../hooks/useFocusMode";
import { useMediaQuery } from "../../utils/motion";
import { registerAudioContext } from "../../utils/audioUnlock";
import { playClick } from "../../utils/clickTimbres";
import NotationRenderer from "../notation/NotationRenderer";
import VirtualPiano from "../piano/VirtualPiano";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import {
  getNoteReadingSummary,
  saveNoteReadingRound,
  type NoteReadingSummary,
  type RoundResponse,
} from "./gamesApi";
import {
  DEFAULT_CONFIG,
  Deck,
  buildDeck,
  focusPool,
  noteLabel,
  parseNoteName,
  pitchPool,
  rangeSpan,
  summarise,
  type Answer,
  type Card as NoteCard,
  type GameConfig,
  type RoundSummary,
} from "./noteReadingDeck";

const CONFIG_KEY = "keyboard-sensei-note-reading-config";
const CLOCK_SECONDS = 60;
const CLOCK_BATCH = 10;
const CORRECT_PAUSE_MS = 420;
const WRONG_PAUSE_MS = 1300;

/** The home row plays one octave: A = C, W = C#, S = D ... J = B, then K, O, L, P, ; carry on up. */
const COMPUTER_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16,
};

function loadConfig(): GameConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as Partial<GameConfig> | null;
    return stored ? { ...DEFAULT_CONFIG, ...stored } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: GameConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage can be blocked; the options just will not be remembered.
  }
}

const CLEF_LABEL = { treble: "Treble", bass: "Bass", both: "Both" } as const;
const RANGE_LABEL = { "c-position": "C position", octave: "One octave", ledger: "Staff + 2 ledger lines" } as const;

const configSummary = (config: GameConfig): string[] => [
  `${CLEF_LABEL[config.clef]} clef`,
  RANGE_LABEL[config.range],
  config.accidentals ? "With sharps and flats" : "Natural notes",
  config.clock === "60" ? "60 second clock" : `${config.deck} cards`,
];

const STAFF_WINDOW_PX = 230;
const STAFF_SCALE = 1.45;

/** One fixed staff height for every card of a clef (the ledger-line span), so the stave never jumps. */
const verticalRangeFor = (clef: "treble" | "bass") => {
  const [lowestNote, highestNote] = rangeSpan("ledger", clef);
  return { lowestNote, highestNote };
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

type Phase = "setup" | "play" | "result";

interface Feedback {
  pressed: number;
  correct: boolean;
}

/** One soft tick for a right answer. */
let tickContext: AudioContext | null = null;
function softClick(): void {
  try {
    tickContext ??= new AudioContext();
    registerAudioContext(tickContext);
    if (tickContext.state === "suspended") void tickContext.resume();
    playClick(tickContext, tickContext.currentTime, false, 0.18, "wood");
  } catch {
    // No audio available; the green key is the feedback.
  }
}

export default function NoteReadingGame() {
  const { device } = useDeviceClass();
  const short = useMediaQuery("(max-height: 500px)");
  const { enter: enterFocus, exit: exitFocus } = useFocusMode();
  const { subscribe, mockAdapter } = useMidiContext();

  const [config, setConfigState] = useState<GameConfig>(loadConfig);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [summary, setSummary] = useState<NoteReadingSummary | null>(null);

  const [card, setCard] = useState<NoteCard | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [asked, setAsked] = useState(0);
  const [timeLeft, setTimeLeft] = useState(CLOCK_SECONDS);
  const [focusMidis, setFocusMidis] = useState<number[] | null>(null);
  const [pitchRange, setPitchRange] = useState<{ lowestNote: number; highestNote: number }>({ lowestNote: 60, highestNote: 71 });

  const [result, setResult] = useState<RoundSummary | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reward, setReward] = useState<RoundResponse | null>(null);

  const deckRef = useRef<Deck | null>(null);
  const poolRef = useRef<ReturnType<typeof pitchPool>>([]);
  const answersRef = useRef<Answer[]>([]);
  const askedIdsRef = useRef<Set<string>>(new Set());
  const shownAtRef = useRef(0);
  const lockedRef = useRef(true);
  const cardRef = useRef<NoteCard | null>(null);
  const expiredRef = useRef(false);
  const startedAtRef = useRef(0);
  const advanceTimerRef = useRef<number | undefined>(undefined);
  const configRef = useRef(config);
  configRef.current = config;
  const pendingPayloadRef = useRef<Parameters<typeof saveNoteReadingRound>[0] | null>(null);

  const setConfig = (patch: Partial<GameConfig>) => {
    const next = { ...config, ...patch };
    setConfigState(next);
    saveConfig(next);
  };

  const refreshSummary = useCallback(() => {
    getNoteReadingSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const showCard = useCallback((next: NoteCard | null) => {
    cardRef.current = next;
    setCard(next);
    setFeedback(null);
    shownAtRef.current = performance.now();
    lockedRef.current = next === null;
  }, []);

  const finish = useCallback(() => {
    window.clearTimeout(advanceTimerRef.current);
    lockedRef.current = true;
    const round = summarise(answersRef.current);
    const elapsed = Math.max(1, Math.round((performance.now() - startedAtRef.current) / 1000));
    setResult(round);
    setReward(null);
    setPhase("result");
    showCard(null);
    if (round.total === 0) {
      pendingPayloadRef.current = null;
      setSave("idle");
      return;
    }
    pendingPayloadRef.current = {
      correct: round.correct,
      total: round.total,
      median_ms: round.medianMs,
      seconds: Math.min(3600, elapsed),
      config: configRef.current,
      slowest: round.slowest.map(({ note, medianMs }) => ({ note, medianMs })),
    };
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCard]);

  async function submit() {
    const payload = pendingPayloadRef.current;
    if (!payload) return;
    setSave("saving");
    try {
      setReward(await saveNoteReadingRound(payload));
      setSave("saved");
      refreshSummary();
    } catch {
      setSave("error");
    }
  }

  const advance = useCallback(
    (correct: boolean) => {
      const deck = deckRef.current;
      if (!deck) return;
      deck.answer(correct);
      const cfg = configRef.current;
      if (cfg.clock === "60") {
        if (expiredRef.current) return finish();
        if (deck.remaining < 3) deck.append(buildDeck(poolRef.current, CLOCK_BATCH, Math.random, cardRef.current ?? undefined));
      }
      const next = deck.current;
      if (!next) return finish();
      showCard(next);
    },
    [finish, showCard],
  );

  const judge = useCallback(
    (pressed: number, timestampMs: number) => {
      const current = cardRef.current;
      if (!current || lockedRef.current) return;
      lockedRef.current = true;
      // Hardware timestamps share the performance.now() clock; fall back if one looks off.
      let ms = timestampMs - shownAtRef.current;
      if (!Number.isFinite(ms) || ms < 0 || ms > 120_000) ms = performance.now() - shownAtRef.current;
      const correct = pressed === current.midi;
      const first = !askedIdsRef.current.has(current.id);
      askedIdsRef.current.add(current.id);
      answersRef.current.push({ card: current, pressed, correct, ms: Math.round(ms), first });
      if (first) setAsked((count) => count + 1);
      setFeedback({ pressed, correct });
      if (correct) softClick();
      advanceTimerRef.current = window.setTimeout(() => advance(correct), correct ? CORRECT_PAUSE_MS : WRONG_PAUSE_MS);
    },
    [advance],
  );

  // On-screen keys, a hardware keyboard and the computer keyboard all arrive as note-on events.
  useEffect(() => {
    if (phase !== "play") return;
    return subscribe((event) => {
      if (event.type === "noteon" && event.velocity > 0) judge(event.note, event.timestampMs);
    });
  }, [phase, subscribe, judge]);

  // Computer keyboard: the home row plays the octave the current note sits in. Registered in the
  // capture phase so the piano's own fixed C4 mapping never also fires.
  useEffect(() => {
    if (phase !== "play") return;
    const held = new Map<string, number>();
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const offset = COMPUTER_KEYS[key];
      if (offset === undefined || event.metaKey || event.ctrlKey || event.altKey || isField(event.target)) return;
      event.stopPropagation();
      const current = cardRef.current;
      if (event.repeat || !current || held.has(key)) return;
      const note = Math.floor(current.midi / 12) * 12 + offset;
      held.set(key, note);
      mockAdapter.triggerNoteOn(note, 100);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const note = held.get(key);
      if (note === undefined) return;
      event.stopPropagation();
      held.delete(key);
      mockAdapter.triggerNoteOff(note);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      for (const note of held.values()) mockAdapter.triggerNoteOff(note);
    };
  }, [phase, mockAdapter]);

  // The 60 second clock.
  useEffect(() => {
    if (phase !== "play" || config.clock !== "60") return;
    const timer = window.setInterval(() => {
      const left = CLOCK_SECONDS - (performance.now() - startedAtRef.current) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(left)));
      if (left > 0) return;
      expiredRef.current = true;
      if (!lockedRef.current) finish();
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, config.clock, finish]);

  useEffect(() => () => window.clearTimeout(advanceTimerRef.current), []);

  // On a phone, or any short screen, a round hides the app chrome so the staff and the keys both fit.
  const wantsFocus = phase === "play" && (short || device === "phone");
  useEffect(() => {
    if (wantsFocus) enterFocus();
    else exitFocus();
  }, [wantsFocus, enterFocus, exitFocus]);
  useEffect(() => exitFocus, [exitFocus]);

  const start = (focus?: number[]) => {
    const cfg = configRef.current;
    const pool = focus && focus.length ? focusPool(focus, cfg.clef) : pitchPool(cfg);
    poolRef.current = pool;
    const count = cfg.clock === "60" ? CLOCK_BATCH * 2 : cfg.deck;
    const deck = new Deck(buildDeck(pool, count, Math.random));
    deckRef.current = deck;
    answersRef.current = [];
    askedIdsRef.current = new Set();
    expiredRef.current = false;
    startedAtRef.current = performance.now();
    const midis = pool.map((entry) => entry.midi);
    setPitchRange({
      lowestNote: Math.max(21, Math.floor(Math.min(...midis) / 12) * 12),
      highestNote: Math.min(108, Math.floor(Math.max(...midis) / 12) * 12 + 11),
    });
    setFocusMidis(focus && focus.length ? focus : null);
    setAsked(0);
    setTimeLeft(CLOCK_SECONDS);
    setSave("idle");
    setPhase("play");
    showCard(deck.current);
  };

  const quit = () => {
    window.clearTimeout(advanceTimerRef.current);
    showCard(null);
    setPhase("setup");
  };

  const notationData = useMemo(
    () => (card ? { clef: card.clef, keySignature: "C", notes: [{ keys: [card.vexKey], duration: "w" }] } : null),
    [card],
  );

  const feedbackByNote = useMemo(() => {
    if (!card || !feedback) return {};
    const marks: Record<number, "correct" | "incorrect"> = { [card.midi]: "correct" };
    if (!feedback.correct) marks[feedback.pressed] = "incorrect";
    return marks;
  }, [card, feedback]);

  const lastSlowestMidis = (summary?.lastSlowest ?? []).flatMap((entry) => {
    const midi = parseNoteName(entry.note);
    return midi === null ? [] : [midi];
  });

  // ------------------------------------------------------------------------------------------------
  const options = (
    <Sheet
      open={optionsOpen}
      onClose={() => setOptionsOpen(false)}
      title="Options"
      trailing={
        <Button variant="plain" onClick={() => setOptionsOpen(false)}>
          Done
        </Button>
      }
    >
      <div className="space-y-4 px-1 pb-2">
        <OptionRow label="Clef">
          <SegmentedControl<GameConfig["clef"]>
            aria-label="Clef"
            block
            value={config.clef}
            onChange={(clef) => setConfig({ clef })}
            options={[
              { value: "treble", label: "Treble" },
              { value: "bass", label: "Bass" },
              { value: "both", label: "Both" },
            ]}
          />
        </OptionRow>
        <OptionRow label="Range">
          <SegmentedControl<GameConfig["range"]>
            aria-label="Range"
            block
            value={config.range}
            onChange={(range) => setConfig({ range })}
            options={[
              { value: "c-position", label: "C position" },
              { value: "octave", label: "One octave" },
              { value: "ledger", label: "+2 ledger lines" },
            ]}
          />
        </OptionRow>
        <OptionRow label="Sharps and flats">
          <SegmentedControl<"on" | "off">
            aria-label="Sharps and flats"
            block
            value={config.accidentals ? "on" : "off"}
            onChange={(value) => setConfig({ accidentals: value === "on" })}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
        </OptionRow>
        <OptionRow label="Clock">
          <SegmentedControl<GameConfig["clock"]>
            aria-label="Clock"
            block
            value={config.clock}
            onChange={(clock) => setConfig({ clock })}
            options={[
              { value: "off", label: "Off" },
              { value: "60", label: "60 s" },
            ]}
          />
        </OptionRow>
        <OptionRow label="Deck size" hint={config.clock === "60" ? "Not used while the clock is on." : undefined}>
          <SegmentedControl<string>
            aria-label="Deck size"
            block
            value={String(config.deck)}
            onChange={(deck) => setConfig({ deck: Number(deck) as GameConfig["deck"] })}
            options={[
              { value: "10", label: "10", disabled: config.clock === "60" },
              { value: "20", label: "20", disabled: config.clock === "60" },
              { value: "40", label: "40", disabled: config.clock === "60" },
            ]}
          />
        </OptionRow>
      </div>
    </Sheet>
  );

  if (phase === "play") {
    const pianoHeight = short ? 84 : device === "phone" ? 112 : 150;
    const scale = short ? 1 : STAFF_SCALE;
    const feedbackEl = (
      <p
        className={short ? "min-w-0 flex-1 truncate text-right text-sm font-medium text-slate-700 dark:text-slate-200" : "h-6 text-center text-sm font-medium text-slate-700 dark:text-slate-200"}
        role="status"
        aria-live="polite"
        data-testid="note-reading-feedback"
      >
        {feedback && card
          ? feedback.correct
            ? "Right"
            : `That was ${noteLabel(card)}. It comes round again soon.`
          : "Press the key for this note"}
      </p>
    );
    return (
      <div className={short ? "mx-auto max-w-3xl space-y-2" : "mx-auto max-w-3xl space-y-3"} data-testid="note-reading-play">
        <div className="flex items-center gap-3">
          <Button variant="gray" size="sm" onClick={quit}>
            Quit
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-sm text-slate-700 dark:text-slate-200">
              <span data-testid="note-reading-progress">
                {config.clock === "60" ? `${asked} answered` : `Card ${Math.min(asked + (feedback ? 0 : 1), deckRef.current?.size ?? 0)} of ${deckRef.current?.size ?? 0}`}
              </span>
              {config.clock === "60" && (
                <span className="font-semibold tabular-nums" data-testid="note-reading-clock">
                  0:{String(timeLeft).padStart(2, "0")}
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-felt-500 transition-[width] duration-200"
                style={{
                  width: `${config.clock === "60" ? ((CLOCK_SECONDS - timeLeft) / CLOCK_SECONDS) * 100 : ((deckRef.current ? asked / deckRef.current.size : 0) * 100)}%`,
                }}
              />
            </div>
          </div>
          {focusMidis && <Chip tone="tint">Slow notes</Chip>}
          {short && feedbackEl}
        </div>

        {/* A window onto the start of a staff: clef, then the note. The renderer draws a whole measure,
            so the stave simply runs off the right edge. */}
        <div
          className="mx-auto flex items-center justify-center overflow-hidden rounded-2xl border border-ivory-200 bg-ivory-50 text-slate-900 shadow-sm"
          style={{ width: STAFF_WINDOW_PX * scale, height: short ? 150 : 250 }}
          role="img"
          aria-label={card ? `A note on the ${card.clef} clef staff. Press its key.` : "Next note"}
          data-testid="note-reading-staff"
          data-note-midi={card?.midi}
          data-note-spelling={card?.spelling}
        >
          {notationData && card && (
            <div
              className="shrink-0 overflow-hidden [&_.inline-block]:border-0 [&_.inline-block]:bg-transparent [&_.inline-block]:shadow-none"
              style={{ width: STAFF_WINDOW_PX, transform: `scale(${scale})`, transformOrigin: "center" }}
            >
              <NotationRenderer key={card.id} data={notationData} verticalRange={verticalRangeFor(card.clef)} />
            </div>
          )}
        </div>

        {!short && feedbackEl}

        <VirtualPiano
          range={pitchRange}
          recommendedRange={card ? { lowestNote: Math.floor(card.midi / 12) * 12, highestNote: Math.floor(card.midi / 12) * 12 + 11 } : undefined}
          feedbackByNote={feedbackByNote}
          showControls={false}
          showHint={false}
          showLabels={false}
          maxWhiteKeyHeightPx={pianoHeight}
        />
        {!short && (
          <p className="text-center text-xs text-slate-600 dark:text-slate-300">
            Computer keyboard: A to J play the octave of the note shown.
          </p>
        )}
      </div>
    );
  }

  if (phase === "result" && result && result.total > 0) {
    const slowIds = result.slowest.map((entry) => entry.midi);
    const percent = Math.round(result.accuracy * 100);
    return (
      <div className="mx-auto max-w-xl space-y-4" data-testid="note-reading-result">
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Round done</h1>
        <Card padding="lg" className="space-y-3 text-center">
          <p className="font-display text-5xl font-semibold text-slate-900 dark:text-slate-100" data-testid="note-reading-accuracy">
            {percent}%
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {result.correct} of {result.total} right first time
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="note-reading-median">
            Median response {seconds(result.medianMs)}
          </p>
        </Card>
        {result.slowest.length > 0 && (
          <Card padding="md" className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-100" data-testid="note-reading-slowest">
              Your slowest notes: <strong>{result.slowest.map((entry) => entry.note).join(", ")}</strong>
            </p>
            <Button variant="tinted" onClick={() => start(slowIds)}>
              Practise these
            </Button>
          </Card>
        )}
        <p className="text-center text-sm text-slate-700 dark:text-slate-200" role="status" data-testid="note-reading-save">
          {save === "saving" && "Saving your round..."}
          {save === "saved" && reward && rewardLine(reward)}
          {save === "error" && (
            <>
              Could not save this round.{" "}
              <button type="button" className="min-h-[44px] underline" onClick={() => void submit()}>
                Try again
              </button>
            </>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="filled" size="lg" className="flex-1" onClick={() => start()}>
            Play again
          </Button>
          <Button variant="gray" size="lg" className="flex-1" onClick={() => setPhase("setup")}>
            Options
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <ErrorState
          title="No notes answered"
          message="The clock ran out before you pressed a key."
          action={
            <Button variant="filled" onClick={() => start()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="note-reading-setup">
      <MidiStatusBar />
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Note reading</h1>
        <p className="text-sm text-slate-700 dark:text-slate-200">A note appears on the staff. Press its key, on the screen, or your keyboard.</p>
      </div>
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Current options">
          {configSummary(config).map((label) => (
            <Chip key={label} tone="tint">
              {label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="filled" size="lg" className="flex-1" onClick={() => start()}>
            Start
          </Button>
          <Button variant="gray" size="lg" onClick={() => setOptionsOpen(true)}>
            Options
          </Button>
        </div>
      </Card>
      {summary && lastSlowestMidis.length > 0 && (
        <Card padding="md" className="space-y-3">
          <p className="text-sm text-slate-800 dark:text-slate-100">
            Slowest last time: <strong>{summary.lastSlowest.map((entry) => entry.note).join(", ")}</strong>
          </p>
          <Button variant="tinted" onClick={() => start(lastSlowestMidis)}>
            Practise these
          </Button>
        </Card>
      )}
      {summary && (
        <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="note-reading-today">
          Today: {summary.correctToday} right so far. Every 10 right earns a Note reading skill point (up to {summary.dailyCap} a day).
        </p>
      )}
      {options}
    </div>
  );
}

function rewardLine(reward: RoundResponse): string {
  const parts: string[] = ["Round saved"];
  if (reward.skill.pointsGainedNow > 0) parts.push(`+${reward.skill.pointsGainedNow} Note reading skill point${reward.skill.pointsGainedNow > 1 ? "s" : ""}`);
  else if (reward.skill.pointsToday >= reward.skill.dailyCap) parts.push("daily skill-point limit reached");
  if (reward.xpGained > 0) parts.push(`+${reward.xpGained} points`);
  return `${parts.join(" · ")}.`;
}

function OptionRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      {children}
      {hint && <p className="text-xs text-slate-600 dark:text-slate-300">{hint}</p>}
    </div>
  );
}
