import { useMemo } from "react";
import type { PlayAlongJudgment, PlayAlongResult, PracticeHands, PracticeLevel } from "@keyboard-sensei/midi-engine";
import type { LoopRange, PracticeRun } from "@keyboard-sensei/playalong-core";
import { Advanced, Button, ListGroup, ListRow, Sheet } from "../ui";
import BarHeatmap from "./BarHeatmap";
import {
  barResults,
  barsLabel,
  bestSpan,
  HANDS_LABELS,
  LEVEL_LABELS,
  PRACTICE_LADDER,
  runStars,
  starCap,
  trickySpan,
} from "./practiceSession";

/** Everything the sheet needs about the run that just finished. */
export interface FinishedRun {
  result: PlayAlongResult;
  /** Wait for me: the engine's own marks (the run is not scored). */
  liveJudgments: readonly (PlayAlongJudgment | undefined)[];
  run: PracticeRun;
  waitMode: boolean;
  level: PracticeLevel;
  hands: PracticeHands;
  tempoPct: number;
  score: number;
  grade: string;
  multiplier: number;
  /** "Clean after 3 goes", when a loop finished clean. */
  loopNote: string | null;
}

export type SubmitState = "idle" | "saving" | "saved" | "failed" | "skipped" | "retired";

/** How a failed attempt save shows: a 404 means the song was retired mid-session, so it is final (never retried). */
export function submitStateForError(error: unknown): SubmitState {
  return (error as { status?: number } | null)?.status === 404 ? "retired" : "failed";
}

interface Props {
  open: boolean;
  onClose: () => void;
  finished: FinishedRun | null;
  submitState: SubmitState;
  /** The rung one step harder/easier than the run's settings, or null at the end. */
  harderRung: number | null;
  easierRung: number | null;
  onPlayAgain: () => void;
  /** Play the same settings without Wait for me. */
  onPlayForStars: () => void;
  onTryWait: () => void;
  onStepLadder: (rung: number) => void;
  /** Loop these bars, repeating until right. */
  onLoopBars: (range: LoopRange) => void;
}

const STAR_WORDS = ["No stars yet", "One star!", "Two stars!", "Three stars!"];

function Stars({ count, cap }: { count: number; cap: number }) {
  return (
    <div className="ks-result__stars" role="img" aria-label={`${count} of ${Math.max(cap, 1)} stars`}>
      {Array.from({ length: Math.max(cap, 1) }, (_, i) => (
        <span key={i} className="ks-result__star" data-earned={i < count || undefined} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  );
}

/**
 * The coaching result: stars and how many notes were played, the best and the tricky
 * part with a one-tap loop, a bar-by-bar map, and one primary action chosen by how the
 * run went. Grade, score, multiplier, notes in a row and extra notes are Advanced only.
 */
export default function PracticeResultSheet({
  open,
  onClose,
  finished,
  submitState,
  harderRung,
  easierRung,
  onPlayAgain,
  onPlayForStars,
  onTryWait,
  onStepLadder,
  onLoopBars,
}: Props) {
  const analysis = useMemo(() => {
    if (!finished) return null;
    const judgments = finished.waitMode ? finished.liveJudgments : finished.result.judgments;
    const bars = barResults(finished.run.bars, finished.run.notes, judgments);
    const played = bars.reduce((sum, bar) => sum + bar.played, 0);
    const total = finished.run.notes.length;
    return { bars, played, total, best: bestSpan(bars), tricky: trickySpan(bars) };
  }, [finished]);

  if (!finished || !analysis) return null;
  const isLoop = finished.run.loop !== null;
  const cap = starCap({ level: finished.level, hands: finished.hands, isLoop });
  const stars = finished.waitMode ? 0 : runStars(finished.result.accuracyPct, { level: finished.level, hands: finished.hands, isLoop });
  const nothingPlayed = analysis.played === 0;

  let headline: string;
  let summary: string;
  if (nothingPlayed) {
    headline = "No notes yet";
    summary = "None of the notes reached the song in time. Try it with Wait for me: the song waits for each key.";
  } else if (finished.waitMode) {
    headline = analysis.played === analysis.total ? "You learned it!" : "Good practice";
    summary = `You played ${analysis.played} of ${analysis.total} notes with Wait for me.`;
  } else if (isLoop) {
    headline = finished.loopNote ?? "Loop done";
    summary = `You played ${analysis.played} of ${analysis.total} notes.`;
  } else {
    headline = STAR_WORDS[stars]!;
    summary = `You played ${analysis.played} of ${analysis.total} notes.`;
  }

  // One primary action, chosen by the outcome.
  const harder = harderRung !== null ? PRACTICE_LADDER[harderRung]! : null;
  const easier = easierRung !== null ? PRACTICE_LADDER[easierRung]! : null;
  let primary: { label: string; onClick: () => void };
  let secondary: { label: string; onClick: () => void } | null = null;
  if (nothingPlayed) {
    primary = finished.waitMode ? { label: "Play again", onClick: onPlayAgain } : { label: "Try with Wait for me", onClick: onTryWait };
    secondary = finished.waitMode ? null : { label: "Play again", onClick: onPlayAgain };
  } else if (finished.waitMode) {
    primary = { label: "Ready to play it for stars?", onClick: onPlayForStars };
    secondary = { label: "Practise again with Wait for me", onClick: onPlayAgain };
  } else if (isLoop) {
    primary = { label: "Loop again", onClick: onPlayAgain };
  } else if (stars >= cap && harder) {
    primary = { label: `Try it harder: ${harder.label}`, onClick: () => onStepLadder(harderRung!) };
    secondary = { label: "Play again", onClick: onPlayAgain };
  } else if (stars === 0 && easier) {
    primary = { label: `Make it easier: ${easier.label}`, onClick: () => onStepLadder(easierRung!) };
    secondary = { label: "Play again", onClick: onPlayAgain };
  } else {
    primary = { label: stars < cap ? `Play again for ${stars + 1} ${stars + 1 === 1 ? "star" : "stars"}` : "Play again", onClick: onPlayAgain };
    if (harder && stars >= 2) secondary = { label: `Try it harder: ${harder.label}`, onClick: () => onStepLadder(harderRung!) };
  }

  const saveText =
    submitState === "saving"
      ? "Saving…"
      : submitState === "saved"
        ? finished.waitMode
          ? "Practice time saved"
          : isLoop
            ? "Saved as practice"
            : "Saved to your history"
        : submitState === "failed"
          ? "Couldn't save this run"
          : submitState === "retired"
            ? "This song is no longer available, so this result wasn't saved."
            : submitState === "skipped"
              ? "Not saved: no notes were played"
              : null;

  return (
    <Sheet open={open} onClose={onClose} title="Your result" detents={["medium", "large"]} className="ks-practice-sheet ks-result">
      <div className="ks-result__head">
        {!finished.waitMode && !nothingPlayed && !isLoop && <Stars count={stars} cap={cap} />}
        <p className="ks-result__headline">{headline}</p>
        <p className="ks-result__summary">{summary}</p>
      </div>

      {(analysis.best || analysis.tricky) && !nothingPlayed && (
        <ListGroup aria-label="Best and tricky parts">
          {analysis.best && (
            <ListRow
              icon="✓"
              iconColor="var(--success)"
              title={`Best part: ${barsLabel(analysis.best)}`}
              subtitle={
                analysis.best.played === analysis.best.total
                  ? `${analysis.best.total} notes, every one played`
                  : `${analysis.best.played} of ${analysis.best.total} notes played`
              }
            />
          )}
          {analysis.tricky && (
            <ListRow
              icon="!"
              iconColor="var(--warning)"
              title={`Tricky part: ${barsLabel(analysis.tricky)}`}
              subtitle={`${analysis.tricky.total - analysis.tricky.played} of ${analysis.tricky.total} notes missed here`}
              accessory={
                <Button variant="tinted" size="sm" onClick={() => onLoopBars({ startBar: analysis.tricky!.startBar, endBar: analysis.tricky!.endBar })}>
                  Loop it
                </Button>
              }
            />
          )}
        </ListGroup>
      )}

      <div className="ks-result__actions">
        <Button variant="filled" size="lg" onClick={primary.onClick} data-autofocus>
          {primary.label}
        </Button>
        {secondary && (
          <Button variant="plain" size="lg" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
      </div>

      {analysis.bars.length > 1 && !nothingPlayed && (
        <section className="ks-result__section" aria-labelledby="ks-heatmap-title">
          <h3 id="ks-heatmap-title" className="ks-list-header">
            Bar by bar · tap a bar to loop it
          </h3>
          <BarHeatmap results={analysis.bars} onSelect={onLoopBars} />
        </section>
      )}

      <Advanced>
        {!finished.waitMode && !nothingPlayed && (
          <ListGroup header="Details" aria-label="Score details">
            <ListRow title="Grade" accessory={<span className="ks-result__value">{finished.grade}</span>} />
            <ListRow
              title="Score"
              subtitle={`${finished.result.baseScore} × difficulty boost ${finished.multiplier.toFixed(2)} (${LEVEL_LABELS[finished.level]}, ${HANDS_LABELS[finished.hands].toLowerCase()}, ${finished.tempoPct}%)`}
              accessory={<span className="ks-result__value">{finished.score}</span>}
            />
            <ListRow title="Notes hit" accessory={<span className="ks-result__value">{finished.result.accuracyPct}%</span>} />
            <ListRow title="Most notes in a row" accessory={<span className="ks-result__value">{finished.result.maxCombo}</span>} />
            <ListRow title="Extra notes" subtitle="Keys you pressed that weren't in the music" accessory={<span className="ks-result__value">{finished.result.wrongPressCount}</span>} />
          </ListGroup>
        )}
      </Advanced>

      {saveText && (
        <p className="ks-result__save" role="status">
          {saveText}
        </p>
      )}
    </Sheet>
  );
}
