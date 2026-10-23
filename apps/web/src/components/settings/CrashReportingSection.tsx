import { monitoring, useCrashConsent } from "../../monitoring";
import { writeConsent, type CrashConsent } from "../../monitoring/consent";

const OPTIONS: { id: CrashConsent; label: string; hint: string }[] = [
  { id: "ask", label: "Ask", hint: "Nothing is sent until you decide." },
  { id: "always", label: "Always", hint: "Send anonymous crash reports." },
  { id: "never", label: "Never", hint: "Send nothing." },
];

/** Settings: the per-device crash-reporting choice. Hidden in builds without monitoring. */
export default function CrashReportingSection() {
  const consent = useCrashConsent();
  if (!monitoring.configured) return null;

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Crash reports</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          When something breaks, an anonymous report (the error, your browser or device type and the app version) goes
          to our error monitor in the EU. No email, name, IP address or recordings. This applies to this device only.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Crash reports">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={consent === option.id}
            title={option.hint}
            onClick={() => writeConsent(option.id)}
            className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
              consent === option.id
                ? "border-felt-500 bg-felt-50 text-felt-700 ring-1 ring-felt-500/40 dark:bg-felt-900/30 dark:text-felt-300"
                : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
