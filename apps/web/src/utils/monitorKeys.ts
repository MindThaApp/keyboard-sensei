import { useSyncExternalStore } from "react";

/**
 * "Sound my key presses": whether the app plays a note through its own speakers when a
 * MIDI keyboard key goes down. Turn it off when the keyboard's own speaker is on, so each
 * note isn't heard twice. It is a hardware choice, so it lives on this device only (not in
 * the per-song practice settings) and applies app-wide.
 */
const KEY = "ks-monitor-keys";

let cached: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

export function parseMonitorKeys(raw: string | null): boolean {
  return raw !== "off";
}

export function getMonitorKeys(): boolean {
  if (cached === null) {
    try {
      cached = parseMonitorKeys(localStorage.getItem(KEY));
    } catch {
      cached = true;
    }
  }
  return cached;
}

export function setMonitorKeys(on: boolean): void {
  cached = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  for (const listener of listeners) listener(on);
}

export function subscribeMonitorKeys(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The synth calls live MIDI input makes: all gated on the one switch. */
export interface MonitorSynth {
  playNote(note: number, velocity: number): void;
  stopNote(note: number): void;
  setSustainPedal(down: boolean): void;
}

/**
 * Wraps the synth for live MIDI keyboard input. With monitoring off every call is dropped,
 * and the keyboard's own speaker is the only sound. Scoring and key lighting don't go
 * through the synth, so they are unaffected.
 */
export function gatedMonitor(synth: MonitorSynth, isOn: () => boolean = getMonitorKeys): MonitorSynth {
  return {
    playNote: (note, velocity) => {
      if (isOn()) synth.playNote(note, velocity);
    },
    stopNote: (note) => {
      // Release is always safe: a note started before the switch went off must not hang.
      synth.stopNote(note);
    },
    setSustainPedal: (down) => {
      // Lifting the pedal is always safe, so a pedal held when the switch went off can't stick.
      if (!down || isOn()) synth.setSustainPedal(down);
    },
  };
}

export function useMonitorKeys(): boolean {
  return useSyncExternalStore(subscribeMonitorKeys, getMonitorKeys, () => true);
}
