import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useMidiContext } from "../midi/MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import { uploadSong, type SongGenre } from "../../services/api";
import { MidiRecorder, type MidiRecordingResult } from "@keyboard-sensei/playalong-core";
import { parsePlayAlongSong } from "@keyboard-sensei/playalong-core";
import { playSequence } from "../../audio/noteSequence";
import { Button, ListGroup } from "../ui";
import { SettingsRow } from "../settings/SettingsRow";

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
  const stopPreviewRef = useRef<(() => void) | null>(null);
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
    stopPreviewRef.current?.();
    stopPreviewRef.current = null;
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
    stopPreviewRef.current = playSequence(parsed.notes, {
      onEnd: () => {
        stopPreviewRef.current = null;
        setState("ready");
      },
    });
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

  const busy = state === "recording" || state === "saving" || state === "playing";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Record</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Play your keyboard or the on-screen piano, then save the take to your library.
          </p>
        </div>
        <Link to="/settings?tab=library" className="ml-auto inline-flex min-h-11 items-center text-sm text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
          Manage library
        </Link>
      </div>

      <MidiStatusBar />

      <ListGroup aria-label="Recorder">
        <SettingsRow
          value={
            <span className="tabular-nums">
              {formatDuration(elapsedSec)} · {liveNoteCount} notes
            </span>
          }
        >
          <Button variant="filled" disabled={busy} onClick={startRecording}>
            Record
          </Button>
          <Button disabled={state !== "recording"} onClick={stopRecording}>
            Stop
          </Button>
          <Button disabled={state === "recording" || state === "saving" || (!recording && elapsedSec === 0)} onClick={discard}>
            Discard
          </Button>
        </SettingsRow>
        {message && (
          <SettingsRow>
            <p role="alert" className="settings-error m-0">{message}</p>
          </SettingsRow>
        )}
      </ListGroup>
      <VirtualPiano showLabels />

      {recording && (
        <ListGroup
          header="Save this take"
          footer={
            canSave
              ? `${formatDuration(recording.durationSec)} · ${recording.noteCount} notes`
              : `${formatDuration(recording.durationSec)} · ${recording.noteCount} notes. Record at least 20 notes over 20 seconds to save to the library.`
          }
          aria-label="Save this take"
        >
          <SettingsRow title="Title">
            <input aria-label="Title" className="settings-field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </SettingsRow>
          <SettingsRow title="Artist">
            <input aria-label="Artist" className="settings-field" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </SettingsRow>
          <SettingsRow title="Genre">
            <select aria-label="Genre" className="settings-field" value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
              {GENRES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </SettingsRow>
          <SettingsRow>
            <Button disabled={state === "playing" || state === "saving"} onClick={playPreview}>
              {state === "playing" ? "Playing…" : "Preview"}
            </Button>
            <Button variant="filled" disabled={!title.trim() || !canSave || state === "saving" || state === "playing"} onClick={() => void save()}>
              {state === "saving" ? "Saving…" : "Save to library"}
            </Button>
          </SettingsRow>
        </ListGroup>
      )}
    </div>
  );
}
