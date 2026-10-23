import { registerPlugin } from "@capacitor/core";
import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";
import { CapacitorMidiAdapter, type NativeMidiPlugin } from "@keyboard-sensei/midi-engine/capacitor";
import { WebMidiAdapter, isWebMidiSupported } from "@keyboard-sensei/midi-engine/web";
import { isNativeApp } from "./platform";

/** A real-keyboard input: Web MIDI in a browser, the native plugin in the Android app. */
export interface HardwareMidiAdapter extends MidiAdapter {
  onStateChange(listener: (devices: MidiDeviceInfo[]) => void): () => void;
}

/** The Android plugin (android/app/src/main/java/com/keyboardsensei/app/midi). */
const NativeMidi = registerPlugin<NativeMidiPlugin>("NativeMidi");

export function createHardwareMidiAdapter(): HardwareMidiAdapter {
  // Android's WebView has no Web MIDI, so the app reads android.media.midi instead.
  // Both stamp events on performance.now(), the clock judging and latency use.
  return isNativeApp() ? new CapacitorMidiAdapter(NativeMidi) : new WebMidiAdapter();
}

export const isHardwareMidiSupported = (): boolean => isNativeApp() || isWebMidiSupported();

/** Bluetooth LE keyboards have to be found and paired from inside the app. */
export const supportsBluetoothMidiScan = (adapter: HardwareMidiAdapter): adapter is CapacitorMidiAdapter =>
  adapter instanceof CapacitorMidiAdapter;
