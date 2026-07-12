import { useEffect, useRef, useState } from "react";
import { useMidiContext } from "./MidiContext";

/** Shows MIDI hardware status and never fails silently on unsupported browsers (Safari/iOS). */
export default function MidiStatusBar() {
  const { webMidiSupported, webMidiConnected, webMidiError, devices, subscribe, connectWebMidi } = useMidiContext();

  // Note activity is held locally rather than on the context: a note-on fires on
  // every key press, and putting it on the shared context value would re-render
  // every consumer (the 88-key VirtualPiano, PlayAlongPage, MidiExercise) on each
  // press just to flash this dot.
  const [activityLit, setActivityLit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== "noteon") return;
      setActivityLit(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActivityLit(false), 400);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subscribe]);

  let dotClass: string;
  let message: string;
  let showConnectButton = false;

  if (!webMidiSupported) {
    dotClass = "bg-amber-500 dark:bg-amber-400";
    message =
      "This browser doesn't support MIDI hardware input (expected on Safari/iOS) — the on-screen piano works exactly the same for every lesson.";
  } else if (webMidiConnected) {
    dotClass = "bg-emerald-500 dark:bg-emerald-400";
    message = `MIDI keyboard connected${devices[0] ? `: ${devices[0].name}` : ""}. The on-screen piano works too.`;
  } else {
    dotClass = "bg-slate-400 dark:bg-slate-500";
    // The "no keyboard detected" text belongs in webMidiError (set by MidiContext
    // once access is actually granted) — using it as the default would tell a user
    // who has never clicked Connect that access was granted when it wasn't.
    message = webMidiError ?? "No MIDI keyboard connected — the on-screen piano works either way.";
    showConnectButton = true;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-200">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <span className="flex-1">{message}</span>
      {webMidiConnected && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full transition-colors duration-150 ${activityLit ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-300 dark:bg-slate-600"}`}
          />
          Listening — play a key to test
        </span>
      )}
      {showConnectButton && (
        <button
          type="button"
          onClick={() => void connectWebMidi()}
          className="secondary-button shrink-0 px-3 py-1 text-xs"
        >
          Connect MIDI Keyboard
        </button>
      )}
    </div>
  );
}
