import { useEffect, useMemo, useRef, useState } from "react";
import { getSongFile, type Song } from "../../services/api";
import { parsePlayAlongSong, songKeyAt, type ParsedPlayAlongSong } from "../../utils/playalongSong";
import { buildSongExcerpt, type PracticeHand } from "../../utils/songExcerpt";
import { AccompanimentPlayer } from "../../utils/accompanimentPlayer";
import MidiExercise from "./MidiExercise";

const DEFAULT_BAR_COUNT = 8;
const MAX_BAR_COUNT = 32;

const HAND_OPTIONS: { value: PracticeHand; label: string }[] = [
  { value: "right", label: "Right hand" },
  { value: "left", label: "Left hand" },
  { value: "both", label: "Both hands" },
];

const fieldClass = "rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";

interface Props {
  song: Song;
}

/**
 * Turns a picked library song into a scored MidiExercise excerpt: bar/hand
 * controls, the excerpt built via buildSongExcerpt, and — when practising a
 * single hand — the other hand played back as accompaniment in sync with
 * MidiExercise's own recording clock and BPM slider.
 */
export default function SongExcerptPractice({ song }: Props) {
  const [parsed, setParsed] = useState<ParsedPlayAlongSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startBar, setStartBar] = useState(0);
  const [barCount, setBarCount] = useState(DEFAULT_BAR_COUNT);
  const [hand, setHand] = useState<PracticeHand>("right");
  const [accompanimentOn, setAccompanimentOn] = useState(true);

  const accompanimentPlayerRef = useRef<AccompanimentPlayer | null>(null);
  if (!accompanimentPlayerRef.current) accompanimentPlayerRef.current = new AccompanimentPlayer();
  const accompanimentOnRef = useRef(accompanimentOn);
  accompanimentOnRef.current = accompanimentOn;

  // Load + reset whenever a different song is picked.
  useEffect(() => {
    let cancelled = false;
    setParsed(null);
    setError(null);
    setStartBar(0);
    setBarCount(DEFAULT_BAR_COUNT);
    setHand("right");
    getSongFile(song.id)
      .then((bytes) => {
        if (!cancelled) setParsed(parsePlayAlongSong(bytes));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this song");
      });
    return () => {
      cancelled = true;
      accompanimentPlayerRef.current?.stop();
    };
  }, [song.id]);

  // Default accompaniment ON for one-handed practice, off for both-hands.
  useEffect(() => {
    setAccompanimentOn(hand !== "both");
  }, [hand]);

  // Belt-and-braces: never leave a note sounding if this view goes away entirely.
  useEffect(() => () => accompanimentPlayerRef.current?.stop(), []);

  const maxBarIndex = parsed ? Math.max(0, parsed.grid.bars.length - 1) : 0;

  const excerpt = useMemo(() => {
    if (!parsed) return null;
    return buildSongExcerpt(parsed, { startBar, barCount, hand, songDifficulty: song.difficulty });
  }, [parsed, startBar, barCount, hand, song.difficulty]);

  const handleRecordingClock = (clock: { startTimeMs: number; effectiveBpm: number } | null) => {
    const player = accompanimentPlayerRef.current!;
    if (!clock || !excerpt || excerpt.accompaniment.length === 0 || hand === "both") {
      player.stop();
      return;
    }
    const rate = clock.effectiveBpm / excerpt.exercise.tempoBpm;
    player.start(excerpt.accompaniment, clock.startTimeMs, rate, () => accompanimentOnRef.current);
  };

  const noNotesMessage =
    hand === "both"
      ? "This section has no notes for either hand — try a different range of bars."
      : `This section has no ${hand}-hand notes — try a different range of bars, or practise the other hand here.`;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!parsed && !error && <p className="text-sm text-slate-500 dark:text-slate-400">Loading “{song.title}”…</p>}

      {parsed && (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Start bar
            <input
              type="number"
              min={1}
              max={maxBarIndex + 1}
              value={startBar + 1}
              onChange={(e) => setStartBar(Math.max(0, Math.min(maxBarIndex, Number(e.target.value) - 1)))}
              className={`mt-1 block w-20 ${fieldClass}`}
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            How many bars
            <input
              type="number"
              min={1}
              max={MAX_BAR_COUNT}
              value={barCount}
              onChange={(e) => setBarCount(Math.max(1, Math.min(MAX_BAR_COUNT, Number(e.target.value))))}
              className={`mt-1 block w-20 ${fieldClass}`}
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Hand
            <select value={hand} onChange={(e) => setHand(e.target.value as PracticeHand)} className={`mt-1 block ${fieldClass}`}>
              {HAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {excerpt && excerpt.accompaniment.length > 0 && hand !== "both" && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={accompanimentOn} onChange={(e) => setAccompanimentOn(e.target.checked)} />
              Play the other hand along with me
            </label>
          )}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{maxBarIndex + 1} bars total</span>
        </div>
      )}

      {parsed && excerpt === null && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{noNotesMessage}</p>
      )}

      {parsed && excerpt && !excerpt.reliable && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This recording's tempo shifts a lot, so timing here is scored loosely.
        </p>
      )}

      {excerpt && (
        <MidiExercise
          key={`${song.id}-${excerpt.exercise.exerciseId}`}
          exerciseId={excerpt.exercise.exerciseId}
          title={`${song.title} — bars ${startBar + 1}–${startBar + barCount} (${hand === "both" ? "both hands" : `${hand} hand`})`}
          instructions={`by ${song.artist}`}
          lessonId={null}
          exercise={excerpt.exercise}
          onRecordingClock={handleRecordingClock}
          notationKey={parsed ? songKeyAt(parsed.keys, excerpt.startS) : undefined}
        />
      )}
    </div>
  );
}
