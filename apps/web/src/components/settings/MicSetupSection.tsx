import { useState } from "react";
import { Link } from "react-router-dom";
import { lastMicDeviceId, useStoredMicCalibration } from "../../audio/mic/micCalibrationStore";
import MicSetup from "../mic/MicSetup";

/** Settings → Microphone: the re-runnable calibration (spec 4.6) and a link to the tuner. */
export default function MicSetupSection() {
  const [open, setOpen] = useState(false);
  const stored = useStoredMicCalibration(lastMicDeviceId() ?? "default");
  return (
    <section className="card space-y-3 p-4" aria-labelledby="mic-setup-heading">
      <div>
        <h2 id="mic-setup-heading" className="font-semibold">Microphone</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          For playing without a MIDI keyboard and for the <Link to="/tune" className="underline">tuner</Link>. Sound is analysed on
          this device and never recorded or uploaded.
        </p>
        <p className="text-sm" data-testid="mic-setup-summary">
          {stored
            ? `Set up${stored.deviceLabel ? ` for ${stored.deviceLabel}` : ""}: noise gate ${stored.gateDb.toFixed(0)} dB, mic delay ${stored.latencyMs} ms.`
            : "Not set up yet: typical values are used."}
        </p>
      </div>
      {open ? (
        <>
          <MicSetup onClose={() => setOpen(false)} />
          <button type="button" className="secondary-button text-xs" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
          {stored ? "Set up again" : "Set up your microphone"}
        </button>
      )}
    </section>
  );
}
