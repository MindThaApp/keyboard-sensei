import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { narrateSection, ttsAudioUrl } from "../../services/api";

interface ReadAloudButtonProps {
  lessonId: string;
  sectionIndex: number;
}

/** Narrates a markdown/theory-card section using the user's chosen voice, reusing the same cached-audio backend for every listener. */
export default function ReadAloudButton({ lessonId, sectionIndex }: ReadAloudButtonProps) {
  const { user } = useAuth();
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.narration_voice_id) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        <Link to="/settings" className="underline">
          Pick a narration voice in Settings
        </Link>{" "}
        to have this read aloud.
      </p>
    );
  }

  async function handleClick() {
    if (audio) {
      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        void audio.play();
        setPlaying(true);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await narrateSection(lessonId, sectionIndex, user!.narration_voice_id!);
      const el = new Audio(ttsAudioUrl(response.audioUrl));
      el.onended = () => setPlaying(false);
      setAudio(el);
      await el.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not narrate this section.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-500"
      >
        {loading ? "Loading…" : playing ? "⏸ Pause" : "🔊 Read aloud"}
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
