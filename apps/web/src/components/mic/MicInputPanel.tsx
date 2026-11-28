import { Button, Card, Chip } from "../ui";
import { t } from "../../i18n";
import type { MicInput } from "../../audio/mic/useMicInput";
import { micSettingsHelp, openMicAppSettings } from "../../audio/mic/micPermission";

/** The sentence every mic screen shows before asking (docs/specs/MUSIC-PORTAL.md 4.7). */
export const MIC_EXPLANATION = "Music Portal listens to grade your playing. Sound is analysed on this device and never recorded or uploaded.";

const LISTEN_TEXT = {
  get listening() { return t("mic.input.listening"); },
  get "too-quiet"() { return t("mic.input.tooQuiet"); },
  get "too-noisy"() { return t("mic.input.tooNoisy"); },
};

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
      <Card role="dialog" aria-label={t("mic.input.dialog")}>
        <p className="font-medium">{t("mic.input.ask")}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("mic.privacy")}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("mic.input.headphones")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="filled" onClick={() => void mic.confirm()}>{t("mic.input.turnOn")}</Button>
          <Button variant="gray" onClick={() => { mic.stop(); onUseKeyboard?.() }}>{t("mic.input.notNow")}</Button>
        </div>
      </Card>
    );
  }
  if (mic.status === "starting") return <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{t("mic.input.opening")}</p>;
  if (mic.status === "denied") {
    const help = micSettingsHelp();
    return (
      <Card role="alert">
        <p className="font-medium">{t("mic.input.offTitle")}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("mic.input.stillWorks")}
          {help.kind === "browser" && ` ${help.text}`}
          {help.kind === "app-settings" && ` ${t("mic.input.allowApp")}`}
          {help.kind === "windows-settings" && ` ${t("mic.input.allowWindows")}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {help.kind === "app-settings" && <Button variant="filled" onClick={() => void openMicAppSettings()}>{t("mic.input.openSettings")}</Button>}
          {help.kind === "windows-settings" && <a className="ks-btn ks-btn--filled ks-btn--md" href={help.href}>{t("mic.input.openMicSettings")}</a>}
          <Button variant="gray" onClick={mic.start}>{t("common.tryAgain")}</Button>
          {onUseKeyboard && <Button variant="gray" onClick={() => { mic.stop(); onUseKeyboard() }}>{t("mic.input.useKeyboard")}</Button>}
        </div>
      </Card>
    );
  }
  if (mic.status === "unsupported" || mic.status === "error") {
    return (
      <Card role="alert">
        <p className="text-sm">
          {mic.status === "unsupported" ? t("mic.input.unsupported") : mic.error ?? t("mic.input.couldNotOpen")}
        </p>
        {onUseKeyboard && <Button className="mt-2" variant="gray" onClick={() => { mic.stop(); onUseKeyboard() }}>{t("mic.input.useKeyboard")}</Button>}
      </Card>
    );
  }
  if (mic.status === "on" && mic.processingOn) {
    return <p className="text-xs text-amber-700 dark:text-amber-300">{t("mic.input.processing")}</p>;
  }
  return null;
}
