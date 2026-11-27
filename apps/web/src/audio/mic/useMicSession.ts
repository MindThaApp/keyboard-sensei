import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AnalysisProfileId } from "@keyboard-sensei/audio-analysis";
import { MicError, micErrorFrom, openMicSession, type MicErrorKind, type MicSession, type OpenMicSession } from "./micPipeline";
import { lastMicDeviceId, micCalibrationFor, rememberMicDevice } from "./micCalibrationStore";

/** Lets tests (and the Windows/Android shells later) swap how a mic session is opened. */
export const MicSessionFactoryContext = createContext<OpenMicSession>(openMicSession);

export type MicSessionState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "listening"; session: MicSession }
  | { status: "error"; kind: MicErrorKind; message: string };

/**
 * Opens the mic only when asked (start), applies the device's calibration
 * (gate, hum notch), and closes it on stop or unmount.
 */
export function useMicSession(profile: AnalysisProfileId, deviceId?: string) {
  const open = useContext(MicSessionFactoryContext);
  const [state, setState] = useState<MicSessionState>({ status: "idle" });
  const sessionRef = useRef<MicSession | null>(null);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    sessionRef.current?.close();
    sessionRef.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(
    async (overrideDeviceId?: string) => {
      const run = ++generation.current;
      sessionRef.current?.close();
      sessionRef.current = null;
      setState({ status: "starting" });
      const device = overrideDeviceId ?? deviceId ?? lastMicDeviceId();
      const calibration = micCalibrationFor(device ?? "default");
      try {
        const session = await open({ profile, deviceId: device, gateDb: calibration.gateDb, humHz: calibration.humHz });
        if (run !== generation.current) {
          session.close();
          return;
        }
        // The browser may have picked a different device than asked: use its own calibration.
        if (session.deviceId !== (device ?? "default")) session.setGate(micCalibrationFor(session.deviceId).gateDb);
        rememberMicDevice(session.deviceId);
        sessionRef.current = session;
        setState({ status: "listening", session });
      } catch (error) {
        if (run !== generation.current) return;
        const e = error instanceof MicError ? error : micErrorFrom(error);
        setState({ status: "error", kind: e.kind, message: e.message });
      }
    },
    [open, profile, deviceId],
  );

  useEffect(
    () => () => {
      generation.current++;
      sessionRef.current?.close();
      sessionRef.current = null;
    },
    [],
  );

  return { state, start, stop };
}
