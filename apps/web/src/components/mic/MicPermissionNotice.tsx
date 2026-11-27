import type { MicErrorKind } from "../../audio/mic/micPipeline";

/** The explanation shown before the browser's permission prompt (spec 4.7). */
export const MIC_PRIVACY_SENTENCE =
  "Music Portal listens to grade your playing. Sound is analysed on this device and never recorded or uploaded.";

const ERROR_HELP: Record<MicErrorKind, { title: string; help: string }> = {
  denied: {
    title: "Microphone access is blocked",
    help: "Allow the microphone for this site in your browser's address bar or site settings (on Windows, also check Settings → Privacy & security → Microphone), then try again. Everything that uses a MIDI keyboard keeps working without it.",
  },
  insecure: {
    title: "The microphone needs a secure connection",
    help: "Open the app over https (or from the installed app) to use the microphone.",
  },
  "not-found": { title: "No microphone found", help: "Plug in or switch on a microphone, then try again." },
  "in-use": { title: "The microphone is busy", help: "Another app may be using it. Close that app, then try again." },
  unsupported: { title: "This browser can't use the microphone", help: "Try a current version of Chrome, Edge, Firefox or Safari." },
  failed: { title: "The microphone could not be started", help: "Try again, or choose another input in Settings → Microphone." },
};

export function MicPermissionNotice({
  purpose,
  onAllow,
  busy = false,
  error,
}: {
  purpose: string;
  onAllow: () => void;
  busy?: boolean;
  error?: { kind: MicErrorKind } | null;
}) {
  const help = error ? ERROR_HELP[error.kind] : null;
  return (
    <div className="card space-y-3 p-4" role="region" aria-label="Microphone access">
      <p className="text-sm">{purpose}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{MIC_PRIVACY_SENTENCE}</p>
      {help && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          <strong className="block">{help.title}</strong>
          <span>{help.help}</span>
        </div>
      )}
      <button type="button" className="primary-button" onClick={onAllow} disabled={busy}>
        {busy ? "Starting…" : error ? "Try again" : "Use the microphone"}
      </button>
    </div>
  );
}
