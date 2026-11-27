import { IntlMessageFormat } from "intl-messageformat";
import { DEFAULT_LOCALE, detectLocale, localeInfo } from "./locales";
import en from "./locales/en-US.json";

export type Messages = Record<string, string>;
export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;
/** Values for rich messages: tag handlers such as `<link>text</link>` receive the inner chunks. */
export type RichValues = Record<string, unknown>;
export type TranslationKey = keyof typeof en;

/** "auto" follows the device language. */
export type LocalePreference = "auto" | string;

const STORAGE_KEY = "ks-locale";

const loaders = import.meta.glob<{ default: Messages }>("./locales/*.json");

const catalogues = new Map<string, Messages>([[DEFAULT_LOCALE, en as Messages]]);
const formatters = new Map<string, IntlMessageFormat>();
let active = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function readPreference(): LocalePreference {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "auto";
  } catch {
    return "auto";
  }
}

export function deviceLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? [...navigator.languages] : navigator.language ? [navigator.language] : [];
}

export function resolveLocale(pref: LocalePreference = readPreference()): string {
  if (pref !== "auto") return localeInfo(pref).code;
  return detectLocale(deviceLanguages());
}

async function load(code: string): Promise<void> {
  if (catalogues.has(code)) return;
  const loader = loaders[`./locales/${code}.json`];
  if (loader) catalogues.set(code, (await loader()).default);
}

/** Loads the catalogue, then switches. Persists the choice unless `persist` is false. */
export async function setLocalePreference(pref: LocalePreference, persist = true): Promise<void> {
  const code = resolveLocale(pref);
  await load(code);
  if (persist) {
    try {
      if (pref === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* private mode: the choice lasts for this session only */
    }
  }
  active = code;
  applyDocument(code);
  listeners.forEach((fn) => fn());
}

export function applyDocument(code: string): void {
  if (typeof document === "undefined") return;
  const info = localeInfo(code);
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.dir;
}

export function getLocale(): string {
  return active;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key: string, values?: MessageValues): string {
  const message = catalogues.get(active)?.[key] ?? (en as Messages)[key];
  if (message === undefined) return key;
  if (!values && !/[{<]/.test(message)) return message;
  const cacheKey = `${active}\u0000${key}`;
  let format = formatters.get(cacheKey);
  if (!format) {
    try {
      format = new IntlMessageFormat(message, active);
    } catch {
      return message;
    }
    formatters.set(cacheKey, format);
  }
  try {
    return String(format.format(values as never));
  } catch {
    return message;
  }
}

/** Like `t`, but tag handlers may return React nodes. Returns the formatted parts. */
export function tParts(key: string, values: RichValues): unknown[] {
  const message = catalogues.get(active)?.[key] ?? (en as Messages)[key];
  if (message === undefined) return [key];
  try {
    const out = new IntlMessageFormat(message, active).format(values as never);
    return Array.isArray(out) ? out : [out];
  } catch {
    return [message];
  }
}

export async function initI18n(): Promise<void> {
  await setLocalePreference(readPreference(), false);
}

/** Test helper: the catalogue for a locale, loaded on demand. */
export async function loadCatalogue(code: string): Promise<Messages> {
  await load(code);
  return catalogues.get(code)!;
}
