import { useEffect, useMemo, useState } from "react";
import MidiStatusBar from "./MidiStatusBar";
import MidiExercise from "./MidiExercise";
import SongExcerptPractice from "./SongExcerptPractice";
import { practiceGymDrills } from "../../data/practiceGymDrills";
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
    <span aria-label={`Difficulty ${level} of 5`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span key={dot} className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-felt-500" : "bg-slate-200 dark:bg-slate-700"}`} />
      ))}
    </span>
  );
}

export default function PracticeGymPage() {
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
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
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">MIDI Practice Gym</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Freeform drills and song excerpts — pick one and play. Not tied to lesson progress.</p>
      </div>

      <MidiStatusBar />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Drills</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {practiceGymDrills.map((drill) => {
            const isSelected = drill.id === selectedDrillId;
            return (
              <button
                key={drill.id}
                type="button"
                onClick={() => selectDrill(drill.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-slate-800 bg-slate-100 dark:border-sky-500 dark:bg-slate-800"
                    : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
                }`}
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">{drill.label}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{drill.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDrill && (
        <MidiExercise
          key={selectedDrill.id}
          exerciseId={selectedDrill.exercise.exerciseId}
          title={selectedDrill.label}
          instructions={selectedDrill.description}
          lessonId={null}
          exercise={selectedDrill.exercise}
        />
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Practise a song</h2>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Pick a few bars of any library song, play one hand while the other plays along, and get a real score.
        </p>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {GENRES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setGenreFilter(item.value)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  genreFilter === item.value
                    ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Difficulty filter"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
          >
            <option value={0}>Any difficulty</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>Difficulty {level}</option>
            ))}
          </select>
          {visibleSongs && <span className="text-xs text-slate-400">{visibleSongs.length} songs</span>}
        </div>

        {songsError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{songsError}</p>}
        {!songs && !songsError && <p className="text-sm text-slate-500 dark:text-slate-400">Loading song library…</p>}

        {visibleSongs && (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {visibleSongs.map((song) => {
              const isSelected = song.id === selectedSongId;
              return (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => selectSong(song.id)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-ivory-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{song.title}</p>
                      <p className="truncate text-xs text-slate-500">{song.artist}</p>
                    </div>
                    <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400">
                      {song.genre}
                    </span>
                    <DifficultyDots level={song.difficulty} />
                  </button>
                </li>
              );
            })}
            {visibleSongs.length === 0 && <li className="px-4 py-2.5 text-sm text-slate-500">No songs match those filters.</li>}
          </ul>
        )}
      </div>

      {selectedSong && <SongExcerptPractice key={selectedSong.id} song={selectedSong} />}
    </div>
  );
}
