import { Button, Card, Chip } from "../ui";
import type { MicInput } from "../../audio/mic/useMicInput";
import { micSettingsHelp, openMicAppSettings } from "../../audio/mic/micPermission";

/** The sentence every mic screen shows before asking (docs/specs/MUSIC-PORTAL.md 4.7). */
export const MIC_EXPLANATION = "Music Portal listens to grade your playing. Sound is analysed on this device and never recorded or uploaded.";

const LISTEN_TEXT = {
  listening: "Listening - mic",
  "too-quiet": "Too quiet - play louder or move closer",
  "too-noisy": "Too noisy - move closer or find a quieter room",
} as const;

/** The status pill, in the place MidiStatusBar shows "Keyboard connected". */
export function MicStatusPill({ mic }: { mic: MicInput }) {
  if (mic.status !== "on") return null;
  const ok = mic.listenState === "listening";
  return (
    <span role="status" aria-live="polite" data-testid="mic-status">
      <Chip tone={ok ? "success" : "neutral"} icon={<span aria-hidden>🎤</span>}>
        {LISTEN_TEXT[mic.listenState]}
      </Chip>
    </span>
  );
}

/** Explanation, permission help and errors for one mic input. Renders nothing while off or on. */
export default function MicInputPanel({ mic, onUseKeyboard }: { mic: MicInput; onUseKeyboard?: () => void }) {
  if (mic.status === "explain") {
    return (
      <Card role="dialog" aria-label="Use the microphone">
        <p className="font-medium">Use your microphone?</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{MIC_EXPLANATION}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Headphones help: the app's own sound then stays out of the grade.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="filled" onClick={() => void mic.confirm()}>Turn on microphone</Button>
          <Button variant="gray" onClick={() => { mic.stop(); onUseKeyboard?.() }}>Not now</Button>
        </div>
      </Card>
    );
  }
  if (mic.status === "starting") return <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Opening the microphone…</p>;
  if (mic.status === "denied") {
    const help = micSettingsHelp();
    return (
      <Card role="alert">
        <p className="font-medium">The microphone is off for Music Portal</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Everything with a MIDI keyboard or the on-screen piano still works.
          {help.kind === "browser" && ` ${help.text}`}
          {help.kind === "app-settings" && " To grade by ear, allow the microphone in the app's settings."}
          {help.kind === "windows-settings" && " To grade by ear, allow the microphone in Windows privacy settings."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {help.kind === "app-settings" && <Button variant="filled" onClick={() => void openMicAppSettings()}>Open settings</Button>}
          {help.kind === "windows-settings" && <a className="ks-btn ks-btn--filled ks-btn--md" href={help.href}>Open microphone settings</a>}
          <Button variant="gray" onClick={mic.start}>Try again</Button>
          {onUseKeyboard && <Button variant="gray" onClick={() => { mic.stop(); onUseKeyboard() }}>Use keyboard instead</Button>}
        </div>
      </Card>
    );
  }
  if (mic.status === "unsupported" || mic.status === "error") {
    return (
      <Card role="alert">
        <p className="text-sm">
          {mic.status === "unsupported" ? "This browser cannot use the microphone. MIDI and the on-screen piano still work." : mic.error ?? "The microphone could not be opened."}
        </p>
        {onUseKeyboard && <Button className="mt-2" variant="gray" onClick={() => { mic.stop(); onUseKeyboard() }}>Use keyboard instead</Button>}
      </Card>
    );
  }
  if (mic.status === "on" && mic.processingOn) {
    return <p className="text-xs text-amber-700 dark:text-amber-300">This device keeps voice processing on for the mic, which can upset grading. Headphones and a quiet room help.</p>;
  }
  return null;
}
