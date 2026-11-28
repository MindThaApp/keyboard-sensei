import { useState } from "react";
import { t, tRich } from "../../i18n";
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
        <h2 id="mic-setup-heading" className="font-semibold">{t("mic.section.title")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {tRich("mic.section.intro", { link: (text) => <Link to="/tune" className="underline">{text}</Link> })}
        </p>
        <p className="text-sm" data-testid="mic-setup-summary">
          {stored
            ? t(stored.deviceLabel ? "mic.section.summaryDevice" : "mic.section.summary", { device: stored.deviceLabel, gate: stored.gateDb.toFixed(0), latency: stored.latencyMs })
            : t("mic.section.notSetUp")}
        </p>
      </div>
      {open ? (
        <>
          <MicSetup onClose={() => setOpen(false)} />
          <button type="button" className="secondary-button text-xs" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
          {stored ? t("mic.section.again") : t("mic.section.setUp")}
        </button>
      )}
    </section>
  );
}
