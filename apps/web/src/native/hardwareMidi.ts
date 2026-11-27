import { registerPlugin } from "@capacitor/core";
import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";
import { CapacitorMidiAdapter, type NativeMidiPlugin } from "@keyboard-sensei/midi-engine/capacitor";
import { WebMidiAdapter, isWebMidiSupported } from "@keyboard-sensei/midi-engine/web";
import { WindowsMidiAdapter } from "@keyboard-sensei/midi-engine/windows";
import { isNativeApp } from "./platform";
import { windowsMidiChannel } from "./windowsHost";

/** A real-keyboard input: Web MIDI in a browser, the native plugin in the Android app. */
export interface HardwareMidiAdapter extends MidiAdapter {
  onStateChange(listener: (devices: MidiDeviceInfo[]) => void): () => void;
}

/** The Android plugin (android/app/src/main/java/com/midivory/app/midi). */
const NativeMidi = registerPlugin<NativeMidiPlugin>("NativeMidi");

export function createHardwareMidiAdapter(): HardwareMidiAdapter {
  // Android's WebView has no Web MIDI, so the app reads android.media.midi instead.
  // Both stamp events on performance.now(), the clock judging and latency use.
  if (isNativeApp()) return new CapacitorMidiAdapter(NativeMidi);
  // The Windows app's native bridge (Windows MIDI Services / WinRT MIDI: BLE,
  // hot-plug) when the host announces it; else Web MIDI inside WebView2 (spec 8.1).
  const windowsChannel = windowsMidiChannel();
  if (windowsChannel) return new WindowsMidiAdapter(windowsChannel);
  return new WebMidiAdapter();
}

export const isHardwareMidiSupported = (): boolean => isNativeApp() || windowsMidiChannel() !== null || isWebMidiSupported();

/** Bluetooth LE keyboards have to be found and paired from inside the app. */
// Not on Windows: keyboards are paired in Windows Settings there (spec 8.3).
export const supportsBluetoothMidiScan = (adapter: HardwareMidiAdapter): adapter is CapacitorMidiAdapter =>
  adapter instanceof CapacitorMidiAdapter && !(adapter instanceof WindowsMidiAdapter);
