import { useEffect, useState } from "react";
import { parsePlayAlongSong, type ParsedPlayAlongSong } from "@keyboard-sensei/playalong-core";
import type { PracticeLevel } from "@keyboard-sensei/midi-engine";
import { getSongFile, getSongs, type Song } from "../../services/api";
import { levelSources, type LevelSources } from "./practiceSession";

export interface PracticeSong {
  /** The song that was opened. */
  song: Song | null;
  sources: LevelSources;
  /** The full version every level is built from. */
  base: ParsedPlayAlongSong;
  /** Authored easier versions by level, already parsed (the Essentials pack). */
  authored: Partial<Record<PracticeLevel, ParsedPlayAlongSong>>;
}

/**
 * Loads a song for practice: the library entry, the full version's MIDI and,
 * for a graded piece, its authored easier versions too. They are small, and
 * loading them up front makes switching level instant.
 */
export function usePracticeSong(songId: string | undefined): { data: PracticeSong | null; error: string | null } {
  const [data, setData] = useState<PracticeSong | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    (async () => {
      const list = await getSongs();
      const sources = levelSources(songId, list.songs);
      const authoredEntries = Object.entries(sources.authoredId) as [PracticeLevel, string][];
      const [baseBytes, ...authoredBytes] = await Promise.all([
        getSongFile(sources.baseId),
        // A missing authored file only costs that level its hand-checked version.
        ...authoredEntries.map(([, id]) => getSongFile(id).catch(() => null)),
      ]);
      const authored: Partial<Record<PracticeLevel, ParsedPlayAlongSong>> = {};
      authoredEntries.forEach(([level], i) => {
        const bytes = authoredBytes[i];
        if (!bytes) return;
        try {
          authored[level] = parsePlayAlongSong(bytes);
        } catch {
          // Falls back to generating the level.
        }
      });
      if (cancelled) return;
      setData({
        song: list.songs.find((item) => item.id === songId) ?? null,
        sources,
        base: parsePlayAlongSong(baseBytes!),
        authored,
      });
    })().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this song");
    });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  return { data, error };
}
