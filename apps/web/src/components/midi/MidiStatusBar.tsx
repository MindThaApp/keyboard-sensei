import { useEffect, useRef, useState } from "react";
import BluetoothMidiPicker from "./BluetoothMidiPicker";
import { useMidiContext } from "./MidiContext";

interface Props {
  /**
   * "banner" (default) is the full status line with the connect controls and always renders.
   * "chip" is for screens where most people have no keyboard: it renders only once one is
   * connected (plus the calibration prompt), as a single compact line.
   */
  variant?: "banner" | "chip";
}

/** Shows keyboard hardware status and never fails silently on unsupported browsers (Safari/iOS). */
export default function MidiStatusBar({ variant = "banner" }: Props) {
  const {
    webMidiSupported,
    webMidiConnected,
    webMidiError,
    devices,
    calibration,
    dismissCalibration,
    subscribe,
    connectWebMidi,
    bluetoothMidiSupported,
  } = useMidiContext();

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
      "This browser can't connect a keyboard (expected on Safari/iOS). The on-screen piano works exactly the same for every lesson.";
  } else if (webMidiConnected) {
    dotClass = "bg-emerald-500 dark:bg-emerald-400";
    message = `Keyboard connected${devices[0] ? `: ${devices[0].name}` : ""}. The on-screen piano works too.`;
  } else {
    dotClass = "bg-slate-400 dark:bg-slate-500";
    // The "no keyboard detected" text belongs in webMidiError (set by MidiContext
    // once access is actually granted) — using it as the default would tell a user
    // who has never clicked Connect that access was granted when it wasn't.
    message = webMidiError ?? "No keyboard connected. The on-screen piano works either way.";
    showConnectButton = true;
  }

  const calibrationMessage =
    calibration.status === "awaitingLow"
      ? "Press the lowest key on your keyboard."
      : calibration.status === "awaitingHigh"
        ? "Press the highest key on your keyboard."
        : null;

  const calibrationPrompt = calibrationMessage && (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="flex-1">
        Calibrate {devices[0]?.name ?? "this keyboard"}: {calibrationMessage}
      </span>
      <button type="button" onClick={dismissCalibration} className="secondary-button px-2 py-1 text-xs">
        Skip
      </button>
    </div>
  );

  if (variant === "chip") {
    if (!webMidiConnected) return calibrationPrompt || null;
    return (
      <div className="space-y-2">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-200">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-150 ${activityLit ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-300 dark:bg-slate-600"}`}
          />
          <span className="truncate">{devices[0] ? `${devices[0].name} connected` : "Keyboard connected"}</span>
        </p>
        {calibrationPrompt}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-200">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <span className="flex-1">{message}</span>
        {webMidiConnected && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full transition-colors duration-150 ${activityLit ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-300 dark:bg-slate-600"}`}
            />
            Listening: play a key to test
          </span>
        )}
        {showConnectButton && (
          <button
            type="button"
            onClick={() => void connectWebMidi()}
            className="secondary-button shrink-0 px-3 py-1 text-xs"
          >
            Connect keyboard
          </button>
        )}
      </div>
      {bluetoothMidiSupported && !webMidiConnected && <BluetoothMidiPicker />}
      {calibrationPrompt}
    </div>
  );
}
