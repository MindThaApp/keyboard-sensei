import { useState } from "react";
import { downloadSong, type Song, type SongExportFormat } from "../../services/api";

const LABELS: Record<SongExportFormat, string> = { midi: "Download MIDI", musicxml: "MusicXML", mei: "MEI" };
const FORMATS: SongExportFormat[] = ["midi", "musicxml", "mei"];

/**
 * Download actions for a song. Shows only what the server said this viewer may download
 * (`song.downloads`); the download route re-checks, so a stale list can only produce an error.
 */
export default function SongDownloadButtons({ song }: { song: Pick<Song, "id" | "title" | "downloads"> }) {
  const [busy, setBusy] = useState<SongExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = FORMATS.filter((format) => song.downloads?.[format]);
  if (allowed.length === 0) return null;

  const run = async (format: SongExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadSong(song, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex items-center gap-1" data-testid="song-downloads">
      {allowed.map((format) => (
        <button
          key={format}
          disabled={busy !== null}
          onClick={() => void run(format)}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label={format === "midi" ? `Download MIDI of ${song.title}` : `Download ${LABELS[format]} of ${song.title}`}
        >
          {busy === format ? "Downloading…" : LABELS[format]}
        </button>
      ))}
      {error && <span role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
    </span>
  );
}
