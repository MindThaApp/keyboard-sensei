import {
  JUDGE_WINDOWS_S,
  judgeNextPress,
  judgePlayAlong,
  type PlayAlongJudgment,
  type PlayAlongNote,
  type PlayAlongPress,
  type PlayAlongResult,
  type PlayAlongTempoPct,
} from "@keyboard-sensei/midi-engine";
import { pianoSynth } from "./synth";

export interface PlayAlongLiveStats {
  judgedCount: number;
  accuracyPct: number;
  combo: number;
  maxCombo: number;
  wrongPressCount: number;
}

export interface PlayAlongEngineOptions {
  notes: PlayAlongNote[];
  durationS: number;
  tempoPct: PlayAlongTempoPct;
  waitMode: boolean;
  guideAudio: boolean;
  /** Song seconds of silence before the first beat. */
  leadInS?: number;
  onFinish: (result: PlayAlongResult, presses: PlayAlongPress[]) => void;
}

const LEAD_IN_S = 3;
const FINISH_GRACE_S = 1;

/**
 * Clock, guide-audio scheduler, wait-mode gate, and live judging for the
 * falling-notes game. All public times are SONG seconds; the wall clock is
 * performance.now() (the same basis MIDI adapter timestamps use), scaled by
 * the tempo percentage.
 *
 * Live judging is greedy-by-press for instant feedback; the authoritative
 * result handed to onFinish comes from judgePlayAlong over the collected
 * presses (non-wait mode only — wait mode is unscored practice).
 */
export class PlayAlongEngine {
  private readonly options: Required<PlayAlongEngineOptions>;
  private readonly rate: number;
  private startMs: number | null = null;
  private lastTickMs = 0;
  private pausedS = 0;

  private presses: PlayAlongPress[] = [];
  /** Judgment per note index; undefined = not yet judged. */
  readonly judgments: (PlayAlongJudgment | undefined)[];
  /** Note indexes sorted by start time, cursor for miss/guide/wait scans. */
  private readonly order: number[];
  private missCursor = 0;
  private guideCursor = 0;
  private waitCursor = 0;
  /** Notes currently required before the song resumes (wait mode). */
  private waitingPitches = new Map<number, number[]>(); // midi → note indexes
  private soundingGuide = new Map<number, number>(); // note index → midi
  private combo = 0;
  private stats: PlayAlongLiveStats = { judgedCount: 0, accuracyPct: 100, combo: 0, maxCombo: 0, wrongPressCount: 0 };
  private accuracySum = 0;
  private finished = false;

  constructor(options: PlayAlongEngineOptions) {
    this.options = { leadInS: LEAD_IN_S, ...options };
    this.rate = options.tempoPct / 100;
    this.judgments = new Array<PlayAlongJudgment | undefined>(options.notes.length).fill(undefined);
    this.order = options.notes
      .map((_, index) => index)
      .sort((a, b) => options.notes[a].startS - options.notes[b].startS);
  }

  start(nowMs = performance.now()): void {
    this.startMs = nowMs;
    this.lastTickMs = nowMs;
  }

  stop(): void {
    this.finished = true;
    for (const midi of this.soundingGuide.values()) pianoSynth.stopNote(midi);
    this.soundingGuide.clear();
  }

  get isWaiting(): boolean {
    return this.waitingPitches.size > 0;
  }

  /** Pitches the song is frozen on (wait mode) — for highlighting keys. */
  get waitingMidis(): number[] {
    return [...this.waitingPitches.keys()];
  }

  get liveStats(): PlayAlongLiveStats {
    return this.stats;
  }

  /** Current song time in seconds; negative during the lead-in countdown. */
  songTime(nowMs = performance.now()): number {
    if (this.startMs === null) return -this.options.leadInS;
    return ((nowMs - this.startMs) / 1000 - this.pausedS) * this.rate - this.options.leadInS;
  }

  /**
   * Advance the clock: handle wait-mode freezing, fire/stop guide audio,
   * mark overdue notes as missed. Returns true when the song has finished.
   */
  tick(nowMs = performance.now()): boolean {
    if (this.finished || this.startMs === null) return this.finished;
    const { notes, waitMode, guideAudio, durationS } = this.options;

    if (this.isWaiting) {
      // Song frozen: consume wall time into pausedS so songTime holds still.
      this.pausedS += (nowMs - this.lastTickMs) / 1000;
    }
    this.lastTickMs = nowMs;
    const songTime = this.songTime(nowMs);

    if (waitMode && !this.isWaiting) {
      // Freeze at the exact moment the next unplayed note becomes due.
      while (this.waitCursor < this.order.length) {
        const index = this.order[this.waitCursor];
        if (notes[index].startS > songTime) break;
        // Rewind the clock so songTime sits exactly on the note start.
        this.pausedS += (songTime - notes[index].startS) / this.rate;
        const dueIndex = this.order[this.waitCursor];
        const dueStart = notes[dueIndex].startS;
        // Collect every note starting at (about) the same moment — chords.
        while (this.waitCursor < this.order.length) {
          const chordIndex = this.order[this.waitCursor];
          if (notes[chordIndex].startS - dueStart > 0.02) break;
          const list = this.waitingPitches.get(notes[chordIndex].midi) ?? [];
          list.push(chordIndex);
          this.waitingPitches.set(notes[chordIndex].midi, list);
          this.waitCursor += 1;
        }
        break;
      }
    }

    if (guideAudio && !this.isWaiting) {
      while (this.guideCursor < this.order.length) {
        const index = this.order[this.guideCursor];
        if (notes[index].startS > songTime) break;
        pianoSynth.playNote(notes[index].midi, 85);
        this.soundingGuide.set(index, notes[index].midi);
        this.guideCursor += 1;
      }
      for (const [index, midi] of this.soundingGuide) {
        if (songTime >= notes[index].startS + notes[index].durationS) {
          pianoSynth.stopNote(midi);
          this.soundingGuide.delete(index);
        }
      }
    }

    if (!waitMode) {
      while (this.missCursor < this.order.length) {
        const index = this.order[this.missCursor];
        if (notes[index].startS + JUDGE_WINDOWS_S.ok > songTime) break;
        if (this.judgments[index] === undefined) this.recordJudgment(index, "miss");
        this.missCursor += 1;
      }
    }

    if (songTime >= durationS + FINISH_GRACE_S) {
      this.finish();
      return true;
    }
    return false;
  }

  /** Feed a key press (from the MIDI stream). timestampMs on the performance.now() basis. */
  pressKey(midi: number, timestampMs: number): void {
    if (this.finished || this.startMs === null) return;
    const songTimeAtPress = this.songTime(timestampMs);
    const { notes, waitMode } = this.options;

    if (waitMode) {
      const waiting = this.waitingPitches.get(midi);
      if (waiting && waiting.length > 0) {
        const index = waiting.shift()!;
        this.judgments[index] = "perfect"; // visual confirmation only; unscored
        if (waiting.length === 0) this.waitingPitches.delete(midi);
      }
      return;
    }

    this.presses.push({ midi, songTimeS: songTimeAtPress });

    const match = judgeNextPress(notes, this.judgments, midi, songTimeAtPress);
    if (!match) {
      this.stats = { ...this.stats, wrongPressCount: this.stats.wrongPressCount + 1 };
      this.combo = 0;
      this.stats.combo = 0;
      return;
    }
    this.recordJudgment(match.index, match.judgment);
  }

  private recordJudgment(index: number, judgment: PlayAlongJudgment): void {
    this.judgments[index] = judgment;
    const value = judgment === "perfect" ? 1 : judgment === "good" ? 0.7 : judgment === "ok" ? 0.4 : 0;
    this.accuracySum += value;
    if (judgment === "perfect" || judgment === "good") {
      this.combo += 1;
    } else {
      this.combo = 0;
    }
    const judgedCount = this.stats.judgedCount + 1;
    this.stats = {
      judgedCount,
      accuracyPct: Math.round((this.accuracySum / judgedCount) * 1000) / 10,
      combo: this.combo,
      maxCombo: Math.max(this.stats.maxCombo, this.combo),
      wrongPressCount: this.stats.wrongPressCount,
    };
  }

  private finish(): void {
    if (this.finished) return;
    this.stop();
    const result = judgePlayAlong(this.options.notes, this.presses);
    this.options.onFinish(result, this.presses);
  }
}
