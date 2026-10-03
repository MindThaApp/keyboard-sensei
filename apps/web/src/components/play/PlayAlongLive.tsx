import { memo } from "react";
import { finalScore } from "@keyboard-sensei/midi-engine";
import VirtualPiano, { type VirtualPianoProps } from "../piano/VirtualPiano";
import { OsmdNotation } from "./OsmdNotation";
import { usePlayAlongRunStore } from "./playAlongRunStore";

/**
 * The pieces of the Play-Along page that change DURING a run. Each subscribes to
 * just its slice of playAlongRunStore, so a score change re-renders the HUD alone
 * and a wait-mode highlight re-renders the piano alone; the page does not re-render.
 */

interface HudProps {
  waitMode: boolean;
  tempoPct: number;
  lookaheadS: number;
  paused: boolean;
}

export const PlayAlongHud = memo(function PlayAlongHud({ waitMode, tempoPct, lookaheadS, paused }: HudProps) {
  const stats = usePlayAlongRunStore((state) => state.stats);
  const countdown = usePlayAlongRunStore((state) => state.countdown);
  const waiting = usePlayAlongRunStore((state) => state.waiting);
  const liveScore = finalScore(
    { judgments: [], wrongPressCount: stats.wrongPressCount, accuracyPct: stats.accuracyPct, maxCombo: stats.maxCombo, baseScore: stats.accuracyPct },
    tempoPct / 100,
    lookaheadS,
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" role="status">
      <span className="tabular-nums"><span className="text-xs text-slate-500">Score </span><strong>{waitMode ? "—" : Math.round(liveScore)}</strong></span>
      <span className="tabular-nums"><span className="text-xs text-slate-500">Accuracy </span><strong>{waitMode ? "—" : `${Math.round(stats.accuracyPct)}%`}</strong></span>
      <span className="tabular-nums"><span className="text-xs text-slate-500">Combo </span><strong className={stats.combo >= 10 ? "text-brass-600 dark:text-brass-400" : ""}>{waitMode ? "—" : stats.combo}</strong></span>
      {waiting && <span className="font-medium text-felt-600 dark:text-felt-400">Waiting for the highlighted key…</span>}
      {countdown !== null && <span className="font-display text-lg font-semibold text-felt-600 dark:text-felt-400">Starting in {countdown}…</span>}
      {paused && <span className="font-medium text-brass-700 dark:text-brass-300">Paused — open Settings to adjust, then resume.</span>}
    </div>
  );
});

/** The stage keyboard, highlighting the keys wait mode is frozen on. */
export const PlayAlongPiano = memo(function PlayAlongPiano(props: Omit<VirtualPianoProps, "expectedNotes" | "showLabels">) {
  const waitingNotes = usePlayAlongRunStore((state) => state.waitingNotes);
  return <VirtualPiano {...props} showLabels={false} expectedNotes={waitingNotes} />;
});

/** Archive MusicXML notation, following the song clock. */
export const LiveOsmdNotation = memo(function LiveOsmdNotation({ notationBytes }: { notationBytes: ArrayBuffer }) {
  const songTimeS = usePlayAlongRunStore((state) => state.songTimeS);
  return <OsmdNotation notationBytes={notationBytes} songTimeS={Math.max(0, songTimeS)} />;
});
