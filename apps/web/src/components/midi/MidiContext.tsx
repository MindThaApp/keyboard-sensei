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
import { MockMidiAdapter, WebMidiAdapter, isWebMidiSupported } from "@keyboard-sensei/midi-engine";
import { pianoSynth } from "../../utils/synth";

type RawMidiListener = (event: RawMidiEvent) => void;

interface MidiContextValue {
  /** Drives the on-screen virtual keyboard. Always available, hardware or not. */
  mockAdapter: MockMidiAdapter;
  webMidiSupported: boolean;
  webMidiConnected: boolean;
  webMidiError: string | null;
  devices: MidiDeviceInfo[];
  connectWebMidi: () => Promise<void>;
  /** Subscribes to the combined raw event stream from both the virtual keyboard and real hardware. */
  subscribe: (listener: RawMidiListener) => () => void;
}

const MidiContext = createContext<MidiContextValue | null>(null);

/**
 * Owns the two MidiAdapter instances for the whole app. No component outside
 * packages/midi-engine may touch navigator.requestMIDIAccess — this provider
 * is the only place adapters are constructed.
 */
export function MidiProvider({ children }: { children: ReactNode }) {
  const mockAdapterRef = useRef<MockMidiAdapter | null>(null);
  if (!mockAdapterRef.current) mockAdapterRef.current = new MockMidiAdapter();
  const webAdapterRef = useRef<WebMidiAdapter | null>(null);
  if (!webAdapterRef.current) webAdapterRef.current = new WebMidiAdapter();

  const listenersRef = useRef<Set<RawMidiListener>>(new Set());

  const [webMidiConnected, setWebMidiConnected] = useState(false);
  const [webMidiError, setWebMidiError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);

  const webMidiSupported = useMemo(() => isWebMidiSupported(), []);

  // MidiAdapter#onNoteOn/onNoteOff have no unsubscribe (by design, per the
  // shared interface), so this registration must run exactly once even
  // though React 18 StrictMode double-invokes effects without cleanup in
  // dev — otherwise every note fires its listeners twice.
  const listenersRegisteredRef = useRef(false);

  useEffect(() => {
    if (listenersRegisteredRef.current) return;
    listenersRegisteredRef.current = true;

    const mockAdapter = mockAdapterRef.current!;
    const webAdapter = webAdapterRef.current!;
    void mockAdapter.connect();

    const emit = (event: RawMidiEvent) => {
      for (const listener of listenersRef.current) listener(event);
    };

    mockAdapter.onNoteOn((note, velocity, timestampMs) => {
      pianoSynth.playNote(note, velocity);
      emit({ note, velocity, type: "noteon", timestampMs });
    });
    mockAdapter.onNoteOff((note, timestampMs) => {
      pianoSynth.stopNote(note);
      emit({ note, velocity: 0, type: "noteoff", timestampMs });
    });

    webAdapter.onNoteOn((note, velocity, timestampMs) => {
      pianoSynth.playNote(note, velocity);
      emit({ note, velocity, type: "noteon", timestampMs });
    });
    webAdapter.onNoteOff((note, timestampMs) => {
      pianoSynth.stopNote(note);
      emit({ note, velocity: 0, type: "noteoff", timestampMs });
    });
  }, []);

  const connectWebMidi = useCallback(async () => {
    if (!webMidiSupported) {
      setWebMidiError(
        "This browser doesn't support Web MIDI hardware input. Use the on-screen keyboard below instead — it works identically for every lesson.",
      );
      return;
    }
    try {
      await webAdapterRef.current!.connect();
      const connectedDevices = webAdapterRef.current!.listDevices();
      if (connectedDevices.length === 0) {
        // requestMIDIAccess() only grants permission — it succeeds even with zero
        // hardware attached (e.g. a keyboard plugged into its USB-to-DEVICE port
        // instead of USB-to-HOST, so the OS never exposes it as a MIDI input).
        setWebMidiConnected(false);
        setWebMidiError("MIDI access granted, but no keyboard was detected — check the USB connection and try again.");
        setDevices([]);
        return;
      }
      setWebMidiConnected(true);
      setWebMidiError(null);
      setDevices(connectedDevices);
    } catch (err) {
      setWebMidiConnected(false);
      setWebMidiError(err instanceof Error ? err.message : "Failed to connect to a MIDI device.");
    }
  }, [webMidiSupported]);

  const subscribe = useCallback((listener: RawMidiListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<MidiContextValue>(
    () => ({
      mockAdapter: mockAdapterRef.current!,
      webMidiSupported,
      webMidiConnected,
      webMidiError,
      devices,
      connectWebMidi,
      subscribe,
    }),
    [webMidiSupported, webMidiConnected, webMidiError, devices, connectWebMidi, subscribe],
  );

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>;
}

export function useMidiContext(): MidiContextValue {
  const ctx = useContext(MidiContext);
  if (!ctx) throw new Error("useMidiContext must be used within a MidiProvider");
  return ctx;
}

