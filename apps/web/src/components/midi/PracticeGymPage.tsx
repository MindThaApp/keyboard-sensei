import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MidiStatusBar from "./MidiStatusBar";
import MidiExercise from "./MidiExercise";
import SongExcerptPicker from "./SongExcerptPicker";
import { practiceGymDrills } from "../../data/practiceGymDrills";
import { Button, ListGroup, ListRow, SegmentedControl } from "../ui";
import { useFocusMode } from "../../hooks/useFocusMode";
import "../settings/settings.css";
import { getSongs, type Song, type SongGenre } from "../../services/api";

const GENRES: { value: SongGenre | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "classical", label: "Classical" },
  { value: "pop", label: "Pop" },
  { value: "film", label: "Film" },
  { value: "game", label: "Game" },
  { value: "jazz", label: "Jazz / Ragtime" },
  { value: "other", label: "Other" },
];

function DifficultyDots({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Difficulty ${level} of 5`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span key={dot} className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-felt-500" : "bg-slate-200 dark:bg-slate-700"}`} />
      ))}
    </span>
  );
}

export default function PracticeGymPage() {
  // ?drill=<id> opens a drill straight away (the Today screen's warm-up links here).
  const [params] = useSearchParams();
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(() => {
    const requested = params.get("drill");
    return practiceGymDrills.some((drill) => drill.id === requested) ? requested : null;
  });
  const selectedDrill = practiceGymDrills.find((d) => d.id === selectedDrillId) ?? null;

  const [songs, setSongs] = useState<Song[] | null>(null);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<SongGenre | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<number>(0);

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch((e) => setSongsError(e instanceof Error ? e.message : "Failed to load song library"));
  }, []);

  const visibleSongs = useMemo(() => {
    if (!songs) return null;
    return songs
      .filter((song) => (genreFilter === "all" || song.genre === genreFilter) && (difficultyFilter === 0 || song.difficulty === difficultyFilter))
      .sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
  }, [songs, genreFilter, difficultyFilter]);

  const selectedSong = songs?.find((s) => s.id === selectedSongId) ?? null;

  // Focus mode shows the open drill and nothing else. The rest of the page is hidden,
  // not unmounted, so the drill keeps its state when focus is toggled.
  const focus = useFocusMode({ hotkey: selectedDrill !== null });
  const focused = focus.active && selectedDrill !== null;
  const { active: focusActive, exit: exitFocus } = focus;
  useEffect(() => {
    if (focusActive && !selectedDrill) exitFocus();
  }, [focusActive, exitFocus, selectedDrill]);

  // Picking a drill or a song opens its exercise further down the page; bring it on
  // screen so the keyboard isn't left below the fold.
  const drillRef = useRef<HTMLDivElement | null>(null);
  const excerptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedDrillId) drillRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [selectedDrillId]);
  useEffect(() => {
    if (selectedSongId) excerptRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [selectedSongId]);

  const selectDrill = (id: string) => {
    setSelectedSongId(null);
    setSelectedDrillId(id);
  };
  const selectSong = (id: string) => {
    setSelectedDrillId(null);
    setSelectedSongId(id);
  };

  return (
    <div className="space-y-4">
      <div hidden={focused}>
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Practice Gym</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Freeform drills and song excerpts — pick one and play. Not tied to lesson progress.</p>
      </div>

      <div hidden={focused}>
        <Link to="/practice/notes" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-felt-700 underline dark:text-felt-300">
          Note reading game
        </Link>
      </div>

      <div hidden={focused}>
        <MidiStatusBar />
      </div>

      <div hidden={focused}>
        <ListGroup header="Drills" headingLevel={2} aria-label="Drills">
          {practiceGymDrills.map((drill) => (
            <ListRow
              key={drill.id}
              title={drill.label}
              subtitle={drill.description}
              onClick={() => selectDrill(drill.id)}
              accessory={drill.id === selectedDrillId ? "Open" : "chevron"}
            />
          ))}
        </ListGroup>
      </div>

      {selectedDrill && (
        <div ref={drillRef} className="scroll-mt-3">
          <div className="mb-2 flex justify-end">
            {focused ? (
              <Button variant="gray" size="sm" onClick={focus.exit} aria-label="Exit focus mode">
                Exit focus
              </Button>
            ) : (
              <Button variant="gray" size="sm" onClick={focus.enter} aria-label="Enter focus mode (F)">
                Focus
              </Button>
            )}
          </div>
          <MidiExercise
            key={selectedDrill.id}
            exerciseId={selectedDrill.exercise.exerciseId}
            title={selectedDrill.label}
            instructions={selectedDrill.description}
            lessonId={null}
            exercise={selectedDrill.exercise}
          />
        </div>
      )}

      <div hidden={focused}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Practise a song</h2>
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
          Pick a few bars of any library song and a hand. They open on the song practice screen, looped, with the other hand playing along.
        </p>

        <div className="mb-3 space-y-2">
          <SegmentedControl<SongGenre | "all">
            aria-label="Genre"
            options={GENRES}
            value={genreFilter}
            onChange={setGenreFilter}
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Difficulty filter"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(Number(e.target.value))}
              className="settings-field"
              style={{ width: "auto" }}
            >
              <option value={0}>Any difficulty</option>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>Difficulty {level}</option>
              ))}
            </select>
            {visibleSongs && <span className="text-xs text-slate-500 dark:text-slate-400">{visibleSongs.length} songs</span>}
          </div>
        </div>

        {songsError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{songsError}</p>}
        {!songs && !songsError && <p className="text-sm text-slate-500 dark:text-slate-400">Loading song library…</p>}

        {visibleSongs && (
          <div className="max-h-96 overflow-y-auto rounded-[var(--r-group)]">
            <ListGroup aria-label="Songs">
              {visibleSongs.map((song) => (
                <ListRow
                  key={song.id}
                  title={song.title}
                  subtitle={song.artist}
                  onClick={() => selectSong(song.id)}
                  accessory={
                    <>
                      <DifficultyDots level={song.difficulty} />
                      {song.id === selectedSongId && <span>Open</span>}
                    </>
                  }
                />
              ))}
              {visibleSongs.length === 0 && <ListRow title="No songs match those filters." />}
            </ListGroup>
          </div>
        )}
      </div>

      {selectedSong && (
        <div ref={excerptRef} hidden={focused} className="scroll-mt-3">
          <SongExcerptPicker key={selectedSong.id} song={selectedSong} />
        </div>
      )}
    </div>
  );
}
