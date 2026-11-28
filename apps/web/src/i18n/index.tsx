import { Fragment, cloneElement, isValidElement, createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  getLocale,
  initI18n,
  readPreference,
  setLocalePreference,
  subscribe,
  t,
  tParts,
  type LocalePreference,
  type RichValues,
  type MessageValues,
} from "./core";
import { localeInfo } from "./locales";

export { LOCALES, DEFAULT_LOCALE, detectLocale, matchLocale, localeInfo } from "./locales";
export { t, getLocale, initI18n, setLocalePreference, readPreference } from "./core";
export type { LocalePreference, MessageValues } from "./core";

/**
 * Message with inline markup, e.g. "Read the <link>terms</link>". Each tag maps to a function that
 * wraps its text: `tRich("key", { link: (text) => <Link to="/terms">{text}</Link> })`.
 */
export function tRich(key: string, values: Record<string, (chunks: ReactNode) => ReactNode> | RichValues): ReactNode {
  const wrapped: RichValues = {};
  for (const [name, value] of Object.entries(values)) {
    wrapped[name] = typeof value === "function" ? (chunks: unknown[]) => (value as (c: ReactNode) => ReactNode)(chunks as ReactNode) : value;
  }
  return tParts(key, wrapped).map((part, i) =>
    isValidElement(part) ? cloneElement(part, { key: i }) : <Fragment key={i}>{part as ReactNode}</Fragment>,
  );
}

interface I18nValue {
  locale: string;
  dir: "ltr" | "rtl";
  preference: LocalePreference;
  t: (key: string, values?: MessageValues) => string;
  setPreference: (pref: LocalePreference) => Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const setPreference = useCallback((pref: LocalePreference) => setLocalePreference(pref), []);
  const value = useMemo<I18nValue>(
    // `locale` is in the deps so consumers re-render when the language changes.
    () => ({ locale, dir: localeInfo(locale).dir, preference: readPreference(), t, setPreference }),
    [locale, setPreference],
  );
  // Remounting on a language change keeps every string (including module-level tables such as the
  // glossary) in step without each component having to subscribe.
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

/** Translation hook. Works without a provider (English) so isolated component tests keep rendering. */
export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return useMemo(
    () => ctx ?? { locale, dir: localeInfo(locale).dir, preference: readPreference(), t, setPreference: setLocalePreference },
    [ctx, locale],
  );
}
