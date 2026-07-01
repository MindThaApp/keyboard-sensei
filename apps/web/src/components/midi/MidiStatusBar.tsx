import { useMidiContext } from "./MidiContext";

/** Shows MIDI hardware status and never fails silently on unsupported browsers (Safari/iOS). */
export default function MidiStatusBar() {
  const { webMidiSupported, webMidiConnected, webMidiError, devices, connectWebMidi } = useMidiContext();

  if (!webMidiSupported) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        Your browser doesn't support MIDI hardware input (this is expected on Safari/iOS). The
        on-screen piano below works exactly the same for every lesson and exercise.
      </div>
    );
  }

  if (webMidiConnected) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
        MIDI keyboard connected{devices[0] ? `: ${devices[0].name}` : ""}. You can also use the
        on-screen piano at any time.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <span>{webMidiError ?? "No MIDI keyboard connected yet — the on-screen piano works either way."}</span>
      <button
        type="button"
        onClick={() => void connectWebMidi()}
        className="shrink-0 rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
      >
        Connect MIDI Keyboard
      </button>
    </div>
  );
}
