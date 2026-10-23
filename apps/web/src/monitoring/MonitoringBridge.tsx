import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { monitoring, useCrashConsent } from ".";
import { writeConsent } from "./consent";

/** Tells monitoring who is signed in: the internal account id only, never the email. */
export function MonitoringBridge() {
  const { user } = useAuth();
  const id = user?.id ?? null;
  useEffect(() => monitoring.setUser(id), [id]);
  return <CrashReportingPrompt />;
}

/** Android, first launch: asks once whether to send anonymous crash reports. */
function CrashReportingPrompt() {
  const consent = useCrashConsent();
  if (!monitoring.configured || consent !== "ask") return null;
  return (
    <section
      role="dialog"
      aria-label="Crash reports"
      className="card fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md space-y-3 p-4 shadow-lg"
    >
      <h2 className="text-sm font-semibold">Help fix crashes?</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Send anonymous crash reports so problems get fixed. They contain technical details only: no email, no name,
        no recordings. You can change this any time in Settings.
      </p>
      <div className="flex gap-2">
        <button className="primary-button" onClick={() => writeConsent("always")}>
          Send reports
        </button>
        <button className="secondary-button" onClick={() => writeConsent("never")}>
          No thanks
        </button>
      </div>
    </section>
  );
}

/** Reports render crashes and shows a way out instead of a blank screen. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    monitoring.captureException(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Reload the page to carry on.</p>
        <button className="primary-button mt-4" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
