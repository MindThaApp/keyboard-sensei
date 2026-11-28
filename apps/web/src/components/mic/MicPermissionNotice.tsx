import type { MicErrorKind } from "../../audio/mic/micPipeline";
import { t } from "../../i18n";

/** The explanation shown before the browser's permission prompt (spec 4.7). */
export const MIC_PRIVACY_SENTENCE =
  "Music Portal listens to grade your playing. Sound is analysed on this device and never recorded or uploaded.";

const ERROR_KEY: Record<MicErrorKind, string> = {
  denied: "denied",
  insecure: "insecure",
  "not-found": "notFound",
  "in-use": "inUse",
  unsupported: "unsupported",
  failed: "failed",
};
const errorHelp = (kind: MicErrorKind) => ({ title: t(`mic.error.${ERROR_KEY[kind]}.title`), help: t(`mic.error.${ERROR_KEY[kind]}.help`) });

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
  const help = error ? errorHelp(error.kind) : null;
  return (
    <div className="card space-y-3 p-4" role="region" aria-label={t("mic.access")}>
      <p className="text-sm">{purpose}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("mic.privacy")}</p>
      {help && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          <strong className="block">{help.title}</strong>
          <span>{help.help}</span>
        </div>
      )}
      <button type="button" className="primary-button" onClick={onAllow} disabled={busy}>
        {busy ? t("mic.starting") : error ? t("common.tryAgain") : t("mic.useMicrophone")}
      </button>
    </div>
  );
}
