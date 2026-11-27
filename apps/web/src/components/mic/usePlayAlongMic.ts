import { useCallback, useEffect, useMemo, useState } from "react";
import type { RawMidiEvent } from "@keyboard-sensei/shared-types";
import type { AccompanimentMute } from "@keyboard-sensei/playalong-core";
import { useMicInput, type MicInput } from "../../audio/mic/useMicInput";

/**
 * Melody play-along from the microphone, for acoustic pianos without MIDI
 * (docs/specs/MUSIC-PORTAL.md 2.2): the mic grades one line, so turning it on
 * switches the song to the melody-only level, and the app's own audio (guide
 * notes, accompaniment) is silenced so it cannot leak into the mic (4.5).
 */

type Subscribe = (listener: (event: RawMidiEvent) => void) => () => void;

interface AudioSettings { guideAudio: boolean; accompanimentMute: AccompanimentMute }

export interface PlayAlongMic {
  on: boolean;
  setOn: (on: boolean) => void;
  mic: MicInput;
  /** The input stream: the mic's while it listens, otherwise the MIDI one passed in. */
  subscribe: Subscribe;
  /** Settings for the run: the app stays silent except the metronome while the mic listens. */
  runSettings: <S extends AudioSettings>(settings: S) => S;
  /** Start must wait for the mic. */
  blocked: boolean;
}

export const MIC_PLAYALONG_LEVEL = "melody" as const;

export function silenceForMic<S extends AudioSettings>(settings: S): S {
  return { ...settings, guideAudio: false, accompanimentMute: { ...settings.accompanimentMute, removed: true, otherHand: true } };
}

export function usePlayAlongMic<L extends string>({ level, setLevel, midiSubscribe }: { level: L; setLevel: (level: L) => void; midiSubscribe: Subscribe }): PlayAlongMic {
  const [on, setOnState] = useState(false);
  const mic = useMicInput("piano");
  const { start, stop } = mic;

  const setOn = useCallback((next: boolean) => {
    setOnState(next);
    if (next && level !== MIC_PLAYALONG_LEVEL) setLevel(MIC_PLAYALONG_LEVEL as unknown as L);
  }, [level, setLevel]);

  useEffect(() => { if (on) start(); else stop() }, [on, start, stop]);
  // Picking a fuller level hands the song back to MIDI: the mic cannot grade it.
  useEffect(() => { if (on && level !== MIC_PLAYALONG_LEVEL) setOnState(false) }, [on, level]);

  const listening = on && mic.status === "on" && mic.source !== null;
  const subscribe = listening ? mic.source!.subscribe : midiSubscribe;
  const runSettings = useMemo(() => (listening ? silenceForMic : <S,>(s: S) => s) as PlayAlongMic["runSettings"], [listening]);
  return { on, setOn, mic, subscribe, runSettings, blocked: on && !listening };
}
