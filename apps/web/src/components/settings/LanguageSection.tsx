import { useId } from "react";
import { LOCALES, matchLocale, t, useT } from "../../i18n";

/** Settings → General: the app language. "Device language" follows the system and is the default. */
export default function LanguageSection() {
  const { preference, locale, setPreference } = useT();
  const id = useId();
  const selected = preference === "auto" ? "auto" : (matchLocale(preference) ?? "auto");
  return (
    <section className="card space-y-3 p-5" aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("settings.language")}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("settings.languageHint")}</p>
      </div>
      <select
        aria-labelledby={`${id}-heading`}
        className="settings-field"
        value={selected}
        data-testid="language-select"
        onChange={(e) => void setPreference(e.target.value)}
      >
        <option value="auto">{t("settings.languageDevice")}</option>
        {LOCALES.map((l) => (
          // Each language is named in itself so it can always be found, whatever the UI language is.
          <option key={l.code} value={l.code} lang={l.code} dir={l.dir}>
            {l.name}
          </option>
        ))}
      </select>
      <p className="sr-only" aria-live="polite">
        {locale}
      </p>
    </section>
  );
}
