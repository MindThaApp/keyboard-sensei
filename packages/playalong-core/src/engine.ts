import {
  JUDGE_WINDOWS_S,
  judgeNextPress,
  judgePlayAlong,
  type PlayAlongJudgment,
  type PlayAlongNote,
  type PlayAlongPress,
  type PlayAlongResult,
} from "@keyboard-sensei/midi-engine";
import { Emitter } from "./emitter";

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
  tempoPct: number;
  waitMode: boolean;
  guideAudio: boolean;
  /** Song seconds of silence before the first beat. */
  leadInS?: number;
  /**
   * How late the player hears the audio, in ms (output latency plus any user
   * calibration). Every press is moved this much earlier before it is judged, so
   * playing in time with what you HEAR scores as in time.
   */
  latencyOffsetMs?: number;
  onFinish: (result: PlayAlongResult, presses: PlayAlongPress[]) => void;
}

/**
 * What the engine tells the outside world. The engine never makes a sound: a
 * platform adapter subscribes and turns guide notes into audio.
 *
 * Guide notes are announced AHEAD of time (see tick's lookahead) with the exact
 * clock time they should start and stop, so an audio backend can schedule them
 * sample-accurately instead of firing "now" from a frame callback.
 */
export type PlayAlongEngineEvent =
  | { type: "guideNoteOn"; noteIndex: number; midi: number; velocity: number; atMs: number }
  | { type: "guideNoteOff"; noteIndex: number; midi: number; atMs: number }
  /** Drop every guide note already announced, sounding or not (pause, stop, tempo change, guide off). */
  | { type: "guideSilence" }
  | { type: "judged"; noteIndex: number; judgment: PlayAlongJudgment }
  | { type: "wrongPress"; midi: number }
  | { type: "waitStart"; midis: number[] }
  | { type: "waitEnd" }
  | { type: "finished"; result: PlayAlongResult };

const LEAD_IN_S = 3;
const FINISH_GRACE_S = 1;
const GUIDE_VELOCITY = 85;

/**
 * Clock, guide-note announcer, wait-mode gate, and live judging for the
 * falling-notes game. All public times are SONG seconds except the `*Ms`
 * arguments, which are the caller's monotonic clock (on the web,
 * performance.now() — the same basis Web MIDI timestamps use).
 *
 * Live judging is greedy-by-press for instant feedback; the authoritative
 * result handed to onFinish comes from judgePlayAlong over the collected
 * presses (non-wait mode only — wait mode is unscored practice).
 */
export class PlayAlongEngine {
  private readonly options: Required<PlayAlongEngineOptions>;
  private readonly emitter = new Emitter<PlayAlongEngineEvent>();
  private rate: number;
  private startMs: number | null = null;
  private lastTickMs = 0;
  private pausedS = 0;
  private paused = false;
  private pauseStartMs: number | null = null;

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
  /** True while guide notes have been announced that a silence must cancel. */
  private guideAnnounced = false;
  private combo = 0;
  private stats: PlayAlongLiveStats = { judgedCount: 0, accuracyPct: 100, combo: 0, maxCombo: 0, wrongPressCount: 0 };
  private accuracySum = 0;
  private finished = false;

  constructor(options: PlayAlongEngineOptions) {
    this.options = { leadInS: LEAD_IN_S, latencyOffsetMs: 0, ...options };
    this.rate = options.tempoPct / 100;
    this.judgments = new Array<PlayAlongJudgment | undefined>(options.notes.length).fill(undefined);
    this.order = options.notes
      .map((_, index) => index)
      .sort((a, b) => options.notes[a].startS - options.notes[b].startS);
  }

  /** Subscribe to engine events. Returns the unsubscribe function. */
  on(listener: (event: PlayAlongEngineEvent) => void): () => void {
    return this.emitter.on(listener);
  }

  start(nowMs: number): void {
    this.startMs = nowMs;
    this.lastTickMs = nowMs;
  }

  stop(): void {
    this.finished = true;
    this.silenceGuide();
  }

  get isWaiting(): boolean {
    return this.waitingPitches.size > 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * Change the playback rate mid-song without moving the playhead.
   *
   * songTime = ((now - startMs)/1000 - pausedS) * rate - leadInS. Changing `rate`
   * alone would yank the song forward or backward, so pausedS is re-solved to keep
   * songTime exactly where it is. Everything that reads songTime() — the notes, the
   * falling bars, the metronome — therefore stays put; only the speed from here on
   * changes. This is what lets the tempo slider work while paused.
   */
  setTempoPct(tempoPct: number, nowMs: number): void {
    if (this.startMs === null) {
      this.rate = tempoPct / 100;
      return;
    }
    const currentSongTime = this.songTime(nowMs);
    const nextRate = Math.max(0.01, tempoPct / 100);
    const anchorMs = this.paused && this.pauseStartMs !== null ? this.pauseStartMs : nowMs;
    this.rate = nextRate;
    this.pausedS =
      (anchorMs - this.startMs) / 1000 - (currentSongTime + this.options.leadInS) / nextRate;
    // Guide notes already announced were timed for the old rate.
    this.silenceGuide(currentSongTime);
  }

  /** Wait mode and guide audio can be toggled mid-run (e.g. while paused). */
  setWaitMode(waitMode: boolean): void {
    this.options.waitMode = waitMode;
    if (!waitMode && this.isWaiting) {
      this.waitingPitches.clear();
      this.emitter.emit({ type: "waitEnd" });
    }
  }

  setGuideAudio(guideAudio: boolean): void {
    this.options.guideAudio = guideAudio;
    if (!guideAudio) this.silenceGuide();
  }

  setLatencyOffsetMs(latencyOffsetMs: number): void {
    this.options.latencyOffsetMs = latencyOffsetMs;
  }

  /** Freeze the song without losing the attempt. Guide audio is silenced. */
  pause(nowMs: number): void {
    if (this.paused) return;
    const songTime = this.songTime(nowMs);
    this.paused = true;
    this.pauseStartMs = nowMs;
    this.silenceGuide(songTime);
  }

  /**
   * Unfreeze. The entire paused span is folded into pausedS here rather than
   * accumulated tick-by-tick, so the freeze is exact whether or not the caller
   * kept ticking while paused. songTime() therefore resumes at precisely the
   * value it held when pause() was called — the notes, the falling bars and the
   * metronome all read songTime(), so none of them can desync across a pause.
   */
  resume(nowMs: number): void {
    if (!this.paused) return;
    if (this.pauseStartMs !== null) this.pausedS += (nowMs - this.pauseStartMs) / 1000;
    this.pauseStartMs = null;
    this.lastTickMs = nowMs;
    this.paused = false;
  }

  /** Playback rate (1 = written tempo). */
  get playbackRate(): number {
    return this.rate;
  }

  /** Pitches the song is frozen on (wait mode) — for highlighting keys. */
  get waitingMidis(): number[] {
    return [...this.waitingPitches.keys()];
  }

  get liveStats(): PlayAlongLiveStats {
    return this.stats;
  }

  /** Current song time in seconds; negative during the lead-in countdown. */
  songTime(nowMs: number): number {
    if (this.startMs === null) return -this.options.leadInS;
    // While paused the clock must HOLD, not merely be corrected on resume:
    // the waterfall, the metronome and the notation cursor all read songTime()
    // every frame, so a clock that kept running would visibly slide the whole
    // display forward while the song was frozen. pausedS only absorbs the gap at
    // resume(), so freeze against the moment the pause began.
    const effectiveNowMs = this.paused && this.pauseStartMs !== null ? this.pauseStartMs : nowMs;
    return ((effectiveNowMs - this.startMs) / 1000 - this.pausedS) * this.rate - this.options.leadInS;
  }

  /**
   * The clock time (same basis as nowMs) at which the song will reach `songTimeS`,
   * assuming it keeps running at the current rate. Only meaningful while the song
   * is running (not paused, not frozen in wait mode) — which is the only time
   * anything is scheduled against it.
   */
  clockTimeAt(songTimeS: number): number {
    const startMs = this.startMs ?? 0;
    return startMs + ((songTimeS + this.options.leadInS) / this.rate + this.pausedS) * 1000;
  }

  /**
   * Advance the clock: handle wait-mode freezing, announce guide notes that start
   * within the next `lookaheadMs` of clock time, and mark overdue notes as missed.
   * Returns true when the song has finished.
   *
   * Safe to call from more than one driver (an audio scheduler's timer and a
   * display's frame loop): every step is idempotent for a given clock time.
   */
  tick(nowMs: number, lookaheadMs = 0): boolean {
    if (this.finished || this.startMs === null) return this.finished;
    const { notes, waitMode, guideAudio, durationS } = this.options;

    if (this.paused) {
      // Frozen. Do NOT accumulate here: the caller may stop ticking while paused,
      // which would leave lastTickMs stale and let the song jump forward on
      // resume. resume() folds the whole paused span in instead.
      this.lastTickMs = nowMs;
      return false;
    }

    if (nowMs < this.lastTickMs) nowMs = this.lastTickMs;
    if (this.isWaiting) {
      // Song frozen: consume wall time into pausedS so songTime holds still.
      this.pausedS += (nowMs - this.lastTickMs) / 1000;
    }
    this.lastTickMs = nowMs;
    const songTime = this.songTime(nowMs);

    if (waitMode && !this.isWaiting) {
      // Freeze at the exact moment the next unplayed note becomes due.
      if (this.waitCursor < this.order.length) {
        const dueStart = notes[this.order[this.waitCursor]].startS;
        if (dueStart <= songTime) {
          // Rewind the clock so songTime sits exactly on the note start.
          this.pausedS += (songTime - dueStart) / this.rate;
          // Collect every note starting at (about) the same moment — chords.
          while (this.waitCursor < this.order.length) {
            const chordIndex = this.order[this.waitCursor];
            if (notes[chordIndex].startS - dueStart > 0.02) break;
            const list = this.waitingPitches.get(notes[chordIndex].midi) ?? [];
            list.push(chordIndex);
            this.waitingPitches.set(notes[chordIndex].midi, list);
            this.waitCursor += 1;
          }
          this.emitter.emit({ type: "waitStart", midis: this.waitingMidis });
        }
      }
    }

    if (guideAudio && !this.isWaiting) this.announceGuide(nowMs, lookaheadMs);

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

  /**
   * Announce every not-yet-announced guide note that starts before the lookahead
   * horizon. In wait mode the horizon never crosses the next note the song will
   * freeze on: that note is announced when the player releases the freeze, exactly
   * as it sounded before guide notes were scheduled ahead.
   */
  private announceGuide(nowMs: number, lookaheadMs: number): void {
    const { notes, waitMode } = this.options;
    let horizonS = this.songTime(nowMs + lookaheadMs);
    if (waitMode && this.waitCursor < this.order.length) {
      const nextFreezeS = notes[this.order[this.waitCursor]].startS;
      if (nextFreezeS < horizonS) horizonS = nextFreezeS - 1e-6;
    }
    while (this.guideCursor < this.order.length) {
      const index = this.order[this.guideCursor];
      const note = notes[index];
      if (note.startS > horizonS) break;
      const onMs = Math.max(nowMs, this.clockTimeAt(note.startS));
      const offMs = Math.max(onMs, this.clockTimeAt(note.startS + note.durationS));
      this.emitter.emit({ type: "guideNoteOn", noteIndex: index, midi: note.midi, velocity: GUIDE_VELOCITY, atMs: onMs });
      this.emitter.emit({ type: "guideNoteOff", noteIndex: index, midi: note.midi, atMs: offMs });
      this.guideAnnounced = true;
      this.guideCursor += 1;
    }
  }

  /**
   * Cancel all announced guide notes. When `fromSongTimeS` is given, notes that had
   * been announced but not yet reached are rewound so they are announced again
   * once the song moves on (after a resume or a tempo change).
   */
  private silenceGuide(fromSongTimeS?: number): void {
    if (fromSongTimeS !== undefined) {
      const { notes } = this.options;
      while (this.guideCursor > 0 && notes[this.order[this.guideCursor - 1]].startS >= fromSongTimeS) {
        this.guideCursor -= 1;
      }
    }
    if (!this.guideAnnounced) return;
    this.guideAnnounced = false;
    this.emitter.emit({ type: "guideSilence" });
  }

  /** Feed a key press (from the MIDI stream). timestampMs on the same clock as tick(). */
  pressKey(midi: number, timestampMs: number): void {
    if (this.finished || this.startMs === null) return;
    const songTimeAtPress = this.songTime(timestampMs - this.options.latencyOffsetMs);
    const { notes, waitMode } = this.options;

    if (waitMode) {
      const waiting = this.waitingPitches.get(midi);
      if (waiting && waiting.length > 0) {
        const index = waiting.shift()!;
        this.judgments[index] = "perfect"; // visual confirmation only; unscored
        if (waiting.length === 0) this.waitingPitches.delete(midi);
        if (!this.isWaiting) this.emitter.emit({ type: "waitEnd" });
      }
      return;
    }

    this.presses.push({ midi, songTimeS: songTimeAtPress });

    const match = judgeNextPress(notes, this.judgments, midi, songTimeAtPress);
    if (!match) {
      this.stats = { ...this.stats, wrongPressCount: this.stats.wrongPressCount + 1, combo: 0 };
      this.combo = 0;
      this.emitter.emit({ type: "wrongPress", midi });
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
    this.emitter.emit({ type: "judged", noteIndex: index, judgment });
  }

  private finish(): void {
    if (this.finished) return;
    this.stop();
    const result = judgePlayAlong(this.options.notes, this.presses);
    this.emitter.emit({ type: "finished", result });
    this.options.onFinish(result, this.presses);
  }
}
