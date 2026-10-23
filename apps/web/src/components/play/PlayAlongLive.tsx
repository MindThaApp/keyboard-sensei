import { lazy, memo, Suspense } from "react";
import { finalScore, type PracticeHands, type PracticeLevel } from "@keyboard-sensei/midi-engine";
import VirtualPiano, { type VirtualPianoProps } from "../piano/VirtualPiano";
import { OsmdNotation } from "./OsmdNotation";
import { usePlayAlongRunStore } from "./playAlongRunStore";

// Verovio is ~7 MB of WASM: its own chunk, fetched only when a score-imported song shows notation.
const VerovioNotation = lazy(() => import("./VerovioNotation"));

/**
 * The pieces of the practice screen that change DURING a run. Each subscribes to
 * just its slice of playAlongRunStore, so a score change re-renders the HUD alone
 * and a wait-mode highlight re-renders the piano alone; the page does not re-render.
 */

interface HudProps {
  waitMode: boolean;
  tempoPct: number;
  lookaheadS: number;
  level: PracticeLevel;
  hands: PracticeHands;
  paused: boolean;
  /** "Loop 3 · last time 92%", while looping. */
  loopLabel: string | null;
  /** Shows the score and the notes-in-a-row count (Advanced mode). */
  detailed: boolean;
}

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (midi: number): string => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Live status while playing. The score only appears once a note has been judged, so a
 * run never opens on a "Score 100" nobody earned; in Simple mode it shows the notes
 * played instead of a multiplied score.
 */
export const PlayAlongHud = memo(function PlayAlongHud({ waitMode, tempoPct, lookaheadS, level, hands, paused, loopLabel, detailed }: HudProps) {
  const stats = usePlayAlongRunStore((state) => state.stats);
  const countdown = usePlayAlongRunStore((state) => state.countdown);
  const waiting = usePlayAlongRunStore((state) => state.waiting);
  const judged = stats.judgedCount > 0;
  const liveScore = finalScore({ baseScore: stats.accuracyPct }, tempoPct / 100, lookaheadS, { level, hands });

  let message: string | null = null;
  if (countdown !== null) message = `Starting in ${countdown}…`;
  else if (paused) message = "Paused";
  else if (waiting) message = "Play the lit key";

  return (
    <div className="ks-practice-hud" role="status" aria-live="polite">
      {message && <span className="ks-practice-hud__message glass-text">{message}</span>}
      {!waitMode && judged && countdown === null && (
        <>
          {detailed ? (
            <span className="ks-practice-hud__stat glass-text">
              <span className="ks-practice-hud__label">Score</span> {Math.round(liveScore)}
            </span>
          ) : (
            <span className="ks-practice-hud__stat glass-text">
              <span className="ks-practice-hud__label">Notes hit</span> {Math.round(stats.accuracyPct)}%
            </span>
          )}
          {detailed && stats.combo >= 2 && (
            <span className="ks-practice-hud__stat glass-text">
              <span className="ks-practice-hud__label">In a row</span> {stats.combo}
            </span>
          )}
        </>
      )}
      {loopLabel && <span className="ks-practice-hud__stat glass-text">{loopLabel}</span>}
    </div>
  );
});

/** Screen-reader announcement of the next note while Wait for me holds the song. */
export const WaitAnnouncer = memo(function WaitAnnouncer() {
  const waitingNotes = usePlayAlongRunStore((state) => state.waitingNotes);
  return (
    <p className="sr-only" aria-live="assertive">
      {waitingNotes.length > 0 ? `Play ${waitingNotes.map(noteName).join(" and ")}` : ""}
    </p>
  );
});

/** The stage keyboard, highlighting the keys wait mode is frozen on. */
export const PlayAlongPiano = memo(function PlayAlongPiano(props: Omit<VirtualPianoProps, "expectedNotes">) {
  const waitingNotes = usePlayAlongRunStore((state) => state.waitingNotes);
  return <VirtualPiano {...props} expectedNotes={waitingNotes} />;
});

/** Archive MusicXML notation, following the song clock. */
export const LiveOsmdNotation = memo(function LiveOsmdNotation({ notationBytes }: { notationBytes: ArrayBuffer }) {
  const songTimeS = usePlayAlongRunStore((state) => state.songTimeS);
  return <OsmdNotation notationBytes={notationBytes} songTimeS={Math.max(0, songTimeS)} />;
});

/** Score-imported songs: Verovio's engraving of the uploaded score, following the song clock. */
export const LiveVerovioNotation = memo(function LiveVerovioNotation({ mei }: { mei: string }) {
  const songTimeS = usePlayAlongRunStore((state) => state.songTimeS);
  return (
    <Suspense fallback={<p className="ks-practice__notation-loading glass-text">Loading the sheet music…</p>}>
      <VerovioNotation mei={mei} songTimeS={Math.max(0, songTimeS)} />
    </Suspense>
  );
});
