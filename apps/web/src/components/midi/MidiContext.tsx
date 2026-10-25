import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MidiDeviceInfo, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { MockMidiAdapter } from "@keyboard-sensei/midi-engine";
import type { NativeBluetoothMidiDevice } from "@keyboard-sensei/midi-engine/capacitor";
import { createHardwareMidiAdapter, isHardwareMidiSupported, supportsBluetoothMidiScan, type HardwareMidiAdapter } from "../../native/hardwareMidi";
import { isNativeApp } from "../../native/platform";
import { pianoSynth } from "../../utils/synth";
import { gatedMonitor } from "../../utils/monitorKeys";
import {
  DEFAULT_RANGE,
  autoRangePreference,
  calibratedRangePreference,
  deviceIdentityKey,
  growRange,
  loadRangePreference,
  saveRangePreference,
  type KeyboardRangePreference,
  type KeyRange,
} from "../../utils/keyboardRange";

type RawMidiListener = (event: RawMidiEvent) => void;
export interface MidiControlChangeEvent { controller: number; value: number; timestampMs: number }
type ControlChangeListener = (event: MidiControlChangeEvent) => void;
type CalibrationState =
  | { status: "idle" }
  | { status: "awaitingLow"; deviceKey: string }
  | { status: "awaitingHigh"; deviceKey: string; lowNote: number };

interface MidiContextValue {
  /** Drives the on-screen virtual keyboard. Always available, hardware or not. */
  mockAdapter: MockMidiAdapter;
  webMidiSupported: boolean;
  webMidiConnected: boolean;
  webMidiError: string | null;
  devices: MidiDeviceInfo[];
  deviceRange: KeyRange;
  setDeviceRange: (r: KeyRange) => void;
  deviceRangePreference: KeyboardRangePreference;
  setDeviceRangePreference: (preference: KeyboardRangePreference) => void;
  currentDeviceKey: string | null;
  calibration: CalibrationState;
  startCalibration: () => void;
  dismissCalibration: () => void;
  sustainPedalDown: boolean;
  connectWebMidi: () => Promise<void>;
  /** The Android app can find and pair Bluetooth LE MIDI keyboards itself. */
  bluetoothMidiSupported: boolean;
  scanBluetoothMidi: () => Promise<NativeBluetoothMidiDevice[]>;
  connectBluetoothMidi: (address: string) => Promise<void>;
  /** Subscribes to the combined raw event stream from both the virtual keyboard and real hardware. */
  subscribe: (listener: RawMidiListener) => () => void;
  /** Subscribes to control-change events from both MIDI sources. */
  subscribeControlChange: (listener: ControlChangeListener) => () => void;
}

const MidiContext = createContext<MidiContextValue | null>(null);

/**
 * Owns the two MidiAdapter instances for the whole app. No component outside
 * packages/midi-engine may touch navigator.requestMIDIAccess — this provider
 * is the only place adapters are constructed.
 */
export function MidiProvider({ children }: { children: ReactNode }) {
  const mockAdapterRef = useRef<MockMidiAdapter | null>(null);
  // performance.now(): the clock Web MIDI stamps hardware events with, so on-screen
  // and hardware presses land on one timeline.
  if (!mockAdapterRef.current) mockAdapterRef.current = new MockMidiAdapter(() => performance.now());
  // Web MIDI in a browser; the native android.media.midi plugin in the Android app.
  const webAdapterRef = useRef<HardwareMidiAdapter | null>(null);
  if (!webAdapterRef.current) webAdapterRef.current = createHardwareMidiAdapter();

  const listenersRef = useRef<Set<RawMidiListener>>(new Set());
  const controlChangeListenersRef = useRef<Set<ControlChangeListener>>(new Set());
  const devicesRef = useRef<MidiDeviceInfo[]>([]);

  const [webMidiConnected, setWebMidiConnected] = useState(false);
  const [webMidiError, setWebMidiError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [currentDeviceKey, setCurrentDeviceKey] = useState<string | null>(null);
  const [deviceRange, setDeviceRangeState] = useState<KeyRange>(DEFAULT_RANGE);
  const [deviceRangePreference, setDeviceRangePreferenceState] = useState<KeyboardRangePreference>(() => autoRangePreference());
  const deviceRangePreferenceRef = useRef<KeyboardRangePreference>(deviceRangePreference);
  const [calibration, setCalibration] = useState<CalibrationState>({ status: "idle" });
  const calibrationRef = useRef<CalibrationState>(calibration);
  const [sustainPedalDown, setSustainPedalDown] = useState(false);

  const webMidiSupported = useMemo(() => isHardwareMidiSupported(), []);
  const bluetoothMidiSupported = useMemo(() => supportsBluetoothMidiScan(webAdapterRef.current!), []);

  const setCalibrationState = useCallback((next: CalibrationState) => {
    calibrationRef.current = next;
    setCalibration(next);
  }, []);

  const setDeviceRange = useCallback((range: KeyRange) => {
    const key = devicesRef.current[0] ? deviceIdentityKey(devicesRef.current[0]) : null;
    const preference = autoRangePreference(range);
    if (key) saveRangePreference(key, preference);
    deviceRangePreferenceRef.current = preference;
    setDeviceRangePreferenceState(preference);
    setDeviceRangeState(range);
  }, []);

  const setDeviceRangePreference = useCallback((preference: KeyboardRangePreference) => {
    const key = devicesRef.current[0] ? deviceIdentityKey(devicesRef.current[0]) : null;
    if (key) saveRangePreference(key, preference);
    deviceRangePreferenceRef.current = preference;
    setDeviceRangePreferenceState(preference);
    setDeviceRangeState(preference.range);
  }, []);

  const syncDevices = useCallback((connectedDevices: MidiDeviceInfo[]) => {
    devicesRef.current = connectedDevices;
    setDevices(connectedDevices);

    const device = connectedDevices[0];
    if (device) {
      const key = deviceIdentityKey(device);
      const stored = loadRangePreference(key);
      const preference = stored ?? autoRangePreference();
      setCurrentDeviceKey(key);
      deviceRangePreferenceRef.current = preference;
      setDeviceRangePreferenceState(preference);
      setDeviceRangeState(preference.range);
      const current = calibrationRef.current;
      if (current.status !== "idle" && current.deviceKey === key) return;
      setCalibrationState(stored ? { status: "idle" } : { status: "awaitingLow", deviceKey: key });
    } else {
      setCurrentDeviceKey(null);
      setCalibrationState({ status: "idle" });
    }
  }, [setCalibrationState]);

  const startCalibration = useCallback(() => {
    const device = devicesRef.current[0];
    if (!device) return;
    setCalibrationState({ status: "awaitingLow", deviceKey: deviceIdentityKey(device) });
  }, [setCalibrationState]);

  const dismissCalibration = useCallback(() => {
    const device = devicesRef.current[0];
    if (!device) return;
    const key = deviceIdentityKey(device);
    const currentCalibration = calibrationRef.current;
    const range = currentCalibration.status === "awaitingHigh"
      ? growRange(deviceRangePreferenceRef.current.range, currentCalibration.lowNote)
      : deviceRangePreferenceRef.current.range;
    const preference = autoRangePreference(range);
    saveRangePreference(key, preference);
    deviceRangePreferenceRef.current = preference;
    setDeviceRangePreferenceState(preference);
    setDeviceRangeState(preference.range);
    setCalibrationState({ status: "idle" });
  }, [setCalibrationState]);

  // Every adapter registration returns its own unsubscribe, so this effect
  // registers in its body and unregisters in its cleanup. Under React 18
  // StrictMode's mount/unmount/mount that leaves exactly one live set of handlers.
  useEffect(() => {
    const mockAdapter = mockAdapterRef.current!;
    const webAdapter = webAdapterRef.current!;
    void mockAdapter.connect();

    const emit = (event: RawMidiEvent) => {
      for (const listener of listenersRef.current) listener(event);
    };
    // Control changes carry the adapter's own timestamp (the performance.now()
    // basis the notes use). They used to be stamped with Date.now(), which put a
    // recorded sustain pedal ~decades away from the notes it was holding.
    // Real keyboard input goes through the monitor gate; the on-screen piano (the mock
    // adapter) always sounds, since nothing else would.
    const hardwareSynth = gatedMonitor(pianoSynth);
    const makeControlChange = (synth: typeof pianoSynth | typeof hardwareSynth) => (controller: number, value: number, timestampMs: number) => {
      if (controller !== 64) return;
      const event = { controller, value, timestampMs };
      for (const listener of controlChangeListenersRef.current) listener(event);
      const down = value >= 64;
      synth.setSustainPedal(down);
      setSustainPedalDown((current) => (current === down ? current : down));
    };
    const makeNoteOff = (synth: typeof pianoSynth | typeof hardwareSynth) => (note: number, timestampMs: number) => {
      synth.stopNote(note);
      emit({ note, velocity: 0, type: "noteoff", timestampMs });
    };

    const unsubscribers: (() => void)[] = [];
    unsubscribers.push(
      mockAdapter.onNoteOn((note, velocity, timestampMs) => {
        pianoSynth.playNote(note, velocity);
        emit({ note, velocity, type: "noteon", timestampMs });
      }),
      mockAdapter.onNoteOff(makeNoteOff(pianoSynth)),
      mockAdapter.onControlChange(makeControlChange(pianoSynth)),
      webAdapter.onNoteOff(makeNoteOff(hardwareSynth)),
      webAdapter.onControlChange(makeControlChange(hardwareSynth)),
    );

    unsubscribers.push(webAdapter.onNoteOn((note, velocity, timestampMs) => {
      hardwareSynth.playNote(note, velocity);
      const currentCalibration = calibrationRef.current;
      const calibrationHandled = currentCalibration.status !== "idle";
      if (currentCalibration.status === "awaitingLow") {
        setCalibrationState({ status: "awaitingHigh", deviceKey: currentCalibration.deviceKey, lowNote: note });
      } else if (currentCalibration.status === "awaitingHigh") {
        const preference = calibratedRangePreference(currentCalibration.lowNote, note);
        saveRangePreference(currentCalibration.deviceKey, preference);
        deviceRangePreferenceRef.current = preference;
        setDeviceRangePreferenceState(preference);
        setDeviceRangeState(preference.range);
        setCalibrationState({ status: "idle" });
      }
      setDeviceRangeState((current) => {
        if (calibrationHandled || deviceRangePreferenceRef.current.mode !== "auto") return current;
        const grown = growRange(current, note);
        if (grown !== current && (grown.lowestNote !== current.lowestNote || grown.highestNote !== current.highestNote)) {
          const key = devicesRef.current[0] ? deviceIdentityKey(devicesRef.current[0]) : null;
          const preference = autoRangePreference(grown);
          if (key) saveRangePreference(key, preference);
          deviceRangePreferenceRef.current = preference;
          setDeviceRangePreferenceState(preference);
          return grown;
        }
        return current;
      });
      emit({ note, velocity, type: "noteon", timestampMs });
    }));

    unsubscribers.push(webAdapter.onStateChange((connectedDevices) => {
      syncDevices(connectedDevices);
      setWebMidiConnected(connectedDevices.length > 0);
      setWebMidiError(connectedDevices.length === 0
        ? "Your keyboard was disconnected. Plug it back in — it should reconnect automatically."
        : null);
    }));

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [syncDevices, setCalibrationState]);

  useEffect(() => {
    const stopEverything = () => {
      pianoSynth.stopAll();
      setSustainPedalDown(false);
    };
    window.addEventListener("pagehide", stopEverything);
    return () => {
      window.removeEventListener("pagehide", stopEverything);
      pianoSynth.stopAll();
    };
  }, []);

  const connectWebMidi = useCallback(async () => {
    if (!webMidiSupported) {
      setWebMidiError(
        "This browser doesn't support connecting a keyboard. Use the on-screen keyboard below instead — it works identically for every lesson.",
      );
      return;
    }
    try {
      await Promise.race([
        webAdapterRef.current!.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("The browser didn't respond to the keyboard request. Unplug your keyboard, plug it back in, then reload the page.")), 5000),
        ),
      ]);
      const connectedDevices = webAdapterRef.current!.listDevices();
      if (connectedDevices.length === 0) {
        // requestMIDIAccess() only grants permission — it succeeds even with zero
        // hardware attached (e.g. a keyboard plugged into its USB-to-DEVICE port
        // instead of USB-to-HOST, so the OS never exposes it as a MIDI input).
        setWebMidiConnected(false);
        setWebMidiError(isNativeApp()
          ? "No keyboard found. Plug one in over USB (most phones need a USB-C OTG adapter), or search for a Bluetooth keyboard."
          : "Keyboard access granted, but no keyboard was detected — check the USB connection and try again.");
        syncDevices([]);
        return;
      }
      setWebMidiConnected(true);
      setWebMidiError(null);
      syncDevices(connectedDevices);
    } catch (err) {
      setWebMidiConnected(false);
      setWebMidiError(err instanceof Error ? err.message : "Failed to connect to a keyboard.");
    }
  }, [webMidiSupported, syncDevices]);

  // Web MIDI permission, once granted, persists for the origin — but the adapter's
  // onmidimessage handlers are rebuilt on every page load, so hardware input stays
  // dead until connect() runs again. Without this, a reload (or opening a lesson /
  // play-along page directly) silently drops the keyboard with no way to notice.
  // Only reconnect when permission is ALREADY granted, so a first-time visitor is
  // never hit with an unprompted permission dialog — they connect via MidiStatusBar.
  useEffect(() => {
    if (!webMidiSupported) return;
    // The Android app needs no permission for USB MIDI, so it always connects.
    if (isNativeApp()) {
      void connectWebMidi();
      return;
    }
    void (async () => {
      try {
        const status = await navigator.permissions.query({ name: "midi" } as unknown as PermissionDescriptor);
        if (status.state === "granted") await connectWebMidi();
      } catch {
        // Browser's Permissions API doesn't recognise "midi" — fall back to the
        // explicit Connect button rather than prompting on load.
      }
    })();
  }, [webMidiSupported, connectWebMidi]);

  const scanBluetoothMidi = useCallback(async () => {
    const adapter = webAdapterRef.current!;
    if (!supportsBluetoothMidiScan(adapter)) return [];
    return adapter.scanBluetooth();
  }, []);

  const connectBluetoothMidi = useCallback(async (address: string) => {
    const adapter = webAdapterRef.current!;
    if (!supportsBluetoothMidiScan(adapter)) return;
    // The plugin opens the device; its devicesChanged event then flows through
    // onStateChange like a USB hot-plug.
    await adapter.connectBluetooth(address);
  }, []);

  const subscribe = useCallback((listener: RawMidiListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const subscribeControlChange = useCallback((listener: ControlChangeListener) => {
    controlChangeListenersRef.current.add(listener);
    return () => {
      controlChangeListenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<MidiContextValue>(
    () => ({
      mockAdapter: mockAdapterRef.current!,
      webMidiSupported,
      webMidiConnected,
      webMidiError,
      devices,
      deviceRange,
      setDeviceRange,
      deviceRangePreference,
      setDeviceRangePreference,
      currentDeviceKey,
      calibration,
      startCalibration,
      dismissCalibration,
      sustainPedalDown,
      connectWebMidi,
      bluetoothMidiSupported,
      scanBluetoothMidi,
      connectBluetoothMidi,
      subscribe,
      subscribeControlChange,
    }),
    [webMidiSupported, webMidiConnected, webMidiError, devices, deviceRange, setDeviceRange, deviceRangePreference, setDeviceRangePreference, currentDeviceKey, calibration, startCalibration, dismissCalibration, sustainPedalDown, connectWebMidi, bluetoothMidiSupported, scanBluetoothMidi, connectBluetoothMidi, subscribe, subscribeControlChange],
  );

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>;
}

export function useMidiContext(): MidiContextValue {
  const ctx = useContext(MidiContext);
  if (!ctx) throw new Error("useMidiContext must be used within a MidiProvider");
  return ctx;
}
