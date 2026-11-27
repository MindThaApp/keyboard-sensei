/** Locales the web/app UI ships in: the union of the Microsoft Store and Google Play top-20 lists. */
export interface LocaleInfo {
  /** BCP 47 tag, also the locale file name. */
  code: string;
  /** Name in its own language, shown in the picker. */
  name: string;
  dir: "ltr" | "rtl";
}

export const DEFAULT_LOCALE = "en-US";

export const LOCALES: readonly LocaleInfo[] = [
  { code: "en-US", name: "English", dir: "ltr" },
  { code: "de-DE", name: "Deutsch", dir: "ltr" },
  { code: "fr-FR", name: "Français", dir: "ltr" },
  { code: "es-ES", name: "Español (España)", dir: "ltr" },
  { code: "es-419", name: "Español (Latinoamérica)", dir: "ltr" },
  { code: "it-IT", name: "Italiano", dir: "ltr" },
  { code: "pt-BR", name: "Português (Brasil)", dir: "ltr" },
  { code: "ja-JP", name: "日本語", dir: "ltr" },
  { code: "zh-Hans", name: "简体中文", dir: "ltr" },
  { code: "zh-Hant", name: "繁體中文", dir: "ltr" },
  { code: "ko-KR", name: "한국어", dir: "ltr" },
  { code: "ru-RU", name: "Русский", dir: "ltr" },
  { code: "pl-PL", name: "Polski", dir: "ltr" },
  { code: "nl-NL", name: "Nederlands", dir: "ltr" },
  { code: "tr-TR", name: "Türkçe", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "hi-IN", name: "हिन्दी", dir: "ltr" },
  { code: "id-ID", name: "Bahasa Indonesia", dir: "ltr" },
  { code: "vi-VN", name: "Tiếng Việt", dir: "ltr" },
  { code: "th-TH", name: "ไทย", dir: "ltr" },
  { code: "sv-SE", name: "Svenska", dir: "ltr" },
  { code: "bn-BD", name: "বাংলা", dir: "ltr" },
  { code: "ur-PK", name: "اردو", dir: "rtl" },
  { code: "fil-PH", name: "Filipino", dir: "ltr" },
];

const BY_CODE = new Map(LOCALES.map((l) => [l.code.toLowerCase(), l]));

export function localeInfo(code: string): LocaleInfo {
  return BY_CODE.get(code.toLowerCase()) ?? BY_CODE.get(DEFAULT_LOCALE.toLowerCase())!;
}

/** Maps a device language tag (e.g. "pt-PT", "zh-TW", "ar-EG", "es-MX") to the nearest shipped locale. */
export function matchLocale(tag: string): string | null {
  const t = tag.replace("_", "-").toLowerCase();
  const exact = BY_CODE.get(t);
  if (exact) return exact.code;
  const [lang, ...rest] = t.split("-");
  if (lang === "zh") {
    const traditional = rest.includes("hant") || rest.some((r) => ["tw", "hk", "mo"].includes(r));
    return traditional ? "zh-Hant" : "zh-Hans";
  }
  if (lang === "es") {
    const spain = rest.length === 0 || rest[0] === "es";
    return spain ? "es-ES" : "es-419";
  }
  if (lang === "pt") return "pt-BR";
  if (lang === "no" || lang === "nb" || lang === "nn") return null;
  if (lang === "tl") return "fil-PH";
  if (lang === "in") return "id-ID";
  const sameLanguage = LOCALES.find((l) => l.code.split("-")[0].toLowerCase() === lang);
  return sameLanguage ? sameLanguage.code : null;
}

/** First device language we have a locale for, else the default. */
export function detectLocale(languages: readonly string[]): string {
  for (const tag of languages) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
