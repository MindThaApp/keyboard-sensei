import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useMidiContext } from "../midi/MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import { uploadSong, type SongGenre } from "../../services/api";
import { MidiRecorder, type MidiRecordingResult } from "@keyboard-sensei/playalong-core";
import { parsePlayAlongSong } from "@keyboard-sensei/playalong-core";
import { pianoSynth } from "../../utils/synth";

const GENRES: { value: SongGenre; label: string }[] = [
  { value: "classical", label: "Classical" },
  { value: "pop", label: "Pop" },
  { value: "film", label: "Film" },
  { value: "game", label: "Game" },
  { value: "jazz", label: "Jazz / Ragtime" },
  { value: "other", label: "Other" },
];

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export default function RecordingPage() {
  const { subscribe, subscribeControlChange } = useMidiContext();
  const navigate = useNavigate();
  const recorderRef = useRef(new MidiRecorder());
  const recordingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [state, setState] = useState<"idle" | "recording" | "ready" | "saving" | "playing">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveNoteCount, setLiveNoteCount] = useState(0);
  const [recording, setRecording] = useState<MidiRecordingResult | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Me");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [message, setMessage] = useState<string | null>(null);
  const canSave = !!recording && recording.noteCount >= 20 && recording.durationSec >= 20;

  const clearPreview = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
    pianoSynth.stopAll();
  };

  useEffect(() => {
    const unsubscribeNotes = subscribe((event) => {
      if (!recordingRef.current) return;
      recorderRef.current.record(event);
    });
    const unsubscribeControlChange = subscribeControlChange((event) => {
      if (!recordingRef.current) return;
      recorderRef.current.record({ type: "controlchange", ...event });
    });
    return () => {
      unsubscribeNotes();
      unsubscribeControlChange();
      clearPreview();
      recordingRef.current = false;
      recorderRef.current.stop(performance.now());
    };
  }, [subscribe, subscribeControlChange]);

  useEffect(() => {
    if (state !== "recording") return undefined;
    const interval = setInterval(() => {
      const snapshot = recorderRef.current.snapshot();
      setElapsedSec(recorderRef.current.elapsedSecAt(performance.now()));
      setLiveNoteCount(snapshot.noteCount);
    }, 100);
    return () => clearInterval(interval);
  }, [state]);

  const startRecording = () => {
    clearPreview();
    recorderRef.current.start();
    recordingRef.current = true;
    setRecording(null);
    setElapsedSec(0);
    setLiveNoteCount(0);
    setMessage(null);
    setState("recording");
  };

  const stopRecording = () => {
    recordingRef.current = false;
    const result = recorderRef.current.stop(performance.now());
    if (!result) {
      setRecording(null);
      setState("idle");
      setMessage("Nothing recorded yet.");
      return;
    }
    setRecording(result);
    setElapsedSec(result.durationSec);
    setLiveNoteCount(result.noteCount);
    setTitle((current) => current || `Recording ${new Date().toLocaleDateString()}`);
    setState("ready");
  };

  const discard = () => {
    clearPreview();
    recordingRef.current = false;
    recorderRef.current.stop(performance.now());
    setRecording(null);
    setElapsedSec(0);
    setLiveNoteCount(0);
    setMessage(null);
    setState("idle");
  };

  const playPreview = () => {
    if (!recording) return;
    clearPreview();
    setState("playing");
    const parsed = parsePlayAlongSong(toArrayBuffer(recording.bytes));
    let lastEnd = 0;
    for (const note of parsed.notes) {
      const onMs = note.startS * 1000;
      const offMs = onMs + note.durationS * 1000;
      lastEnd = Math.max(lastEnd, offMs);
      timersRef.current.push(setTimeout(() => pianoSynth.playNote(note.midi, 90), onMs));
      timersRef.current.push(setTimeout(() => pianoSynth.stopNote(note.midi), offMs));
    }
    timersRef.current.push(setTimeout(() => setState("ready"), lastEnd + 150));
  };

  const save = async () => {
    if (!recording || !title.trim()) return;
    clearPreview();
    setState("saving");
    setMessage(null);
    try {
      await uploadSong(new Blob([toArrayBuffer(recording.bytes)], { type: "audio/midi" }), {
        title: title.trim(),
        artist: artist.trim() || "Me",
        genre,
        origin: "recording",
      });
      navigate("/settings?tab=library");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save recording");
      setState("ready");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Record</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Play your MIDI keyboard or the on-screen piano, then save the take to your library.
          </p>
        </div>
        <Link to="/settings?tab=library" className="ml-auto text-sm text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Manage library
        </Link>
      </div>

      <MidiStatusBar />

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button className="primary-button text-sm" disabled={state === "recording" || state === "saving" || state === "playing"} onClick={startRecording}>
            Record
          </button>
          <button className="secondary-button text-sm" disabled={state !== "recording"} onClick={stopRecording}>
            Stop
          </button>
          <button className="secondary-button text-sm" disabled={state === "recording" || state === "saving" || (!recording && elapsedSec === 0)} onClick={discard}>
            Discard
          </button>
          <div className="ml-auto flex gap-4 text-sm tabular-nums text-slate-600 dark:text-slate-300">
            <span>{formatDuration(elapsedSec)}</span>
            <span>{liveNoteCount} notes</span>
          </div>
        </div>
        {message && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{message}</p>}
        <VirtualPiano showLabels />
      </section>

      {recording && (
        <section className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">Title
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-xs text-slate-500">Artist
              <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-slate-500">Genre
            <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
              {GENRES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            {formatDuration(recording.durationSec)} · {recording.noteCount} notes
          </p>
          {!canSave && (
            <p className="text-xs text-slate-500">
              Record at least 20 notes over 20 seconds to save to the library.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button text-sm" disabled={state === "playing" || state === "saving"} onClick={playPreview}>
              {state === "playing" ? "Playing…" : "Preview"}
            </button>
            <button className="primary-button text-sm" disabled={!title.trim() || !canSave || state === "saving" || state === "playing"} onClick={() => void save()}>
              {state === "saving" ? "Saving…" : "Save to library"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
