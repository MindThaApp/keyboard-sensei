import { useState } from "react";
import type { NativeBluetoothMidiDevice } from "@keyboard-sensei/midi-engine/capacitor";
import { useMidiContext } from "./MidiContext";

type PickerState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "results"; devices: NativeBluetoothMidiDevice[] }
  | { status: "connecting"; address: string }
  | { status: "error"; message: string };

/**
 * Android app only: Bluetooth LE MIDI keyboards are not listed until something
 * scans for them and opens them, which a browser would do in its own settings.
 */
export default function BluetoothMidiPicker() {
  const { scanBluetoothMidi, connectBluetoothMidi } = useMidiContext();
  const [state, setState] = useState<PickerState>({ status: "idle" });

  const scan = async () => {
    setState({ status: "scanning" });
    try {
      setState({ status: "results", devices: await scanBluetoothMidi() });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Bluetooth scan failed." });
    }
  };

  const connect = async (address: string) => {
    setState({ status: "connecting", address });
    try {
      await connectBluetoothMidi(address);
      setState({ status: "idle" });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Couldn't connect to that keyboard." });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
      <button
        type="button"
        onClick={() => void scan()}
        disabled={state.status === "scanning" || state.status === "connecting"}
        className="secondary-button px-3 py-1 text-xs"
      >
        {state.status === "scanning" ? "Searching for Bluetooth keyboards…" : "Find a Bluetooth MIDI keyboard"}
      </button>
      {state.status === "results" && state.devices.length === 0 && (
        <span>None found. Turn the keyboard's Bluetooth MIDI on and search again.</span>
      )}
      {state.status === "results" &&
        state.devices.map((device) => (
          <button key={device.address} type="button" onClick={() => void connect(device.address)} className="secondary-button px-3 py-1 text-xs">
            Connect {device.name}
          </button>
        ))}
      {state.status === "connecting" && <span>Connecting…</span>}
      {state.status === "error" && <span role="alert">{state.message}</span>}
    </div>
  );
}
