// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntlMessageFormat } from "intl-messageformat";
import { DEFAULT_LOCALE, LOCALES, I18nProvider, detectLocale, localeInfo, matchLocale, setLocalePreference, t } from "./index";
import DailyGoalPicker from "../components/settings/DailyGoalPicker";
import LanguageSection from "../components/settings/LanguageSection";
import { MidiProvider } from "../components/midi/MidiContext";
import { AppearanceProvider } from "../contexts/AppearanceContext";
import VirtualPiano from "../components/piano/VirtualPiano";
import { ForgotPasswordPage } from "../components/auth/AccountRecoveryPages";

// jsdom has no matchMedia; the appearance provider reads it.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  });
}

if (typeof window !== "undefined" && !("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

const dir = join(__dirname, "locales");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (code: string): Record<string, string> => JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
const en = load(DEFAULT_LOCALE);
const codes = LOCALES.map((l) => l.code);

type MessageFormatElement = ReturnType<IntlMessageFormat["getAst"]>[number];

// AST node types from @formatjs/icu-messageformat-parser
const T = { literal: 0, argument: 1, number: 2, date: 3, time: 4, select: 5, plural: 6, pound: 7, tag: 8 };

interface Shape {
  args: Set<string>;
  tags: Set<string>;
  plurals: { arg: string; options: string[] }[];
}

function shapeOf(message: string, locale: string): Shape {
  const shape: Shape = { args: new Set(), tags: new Set(), plurals: [] };
  const walk = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case T.argument:
        case T.number:
        case T.date:
        case T.time:
          shape.args.add((node as { value: string }).value);
          break;
        case T.select:
        case T.plural: {
          const n = node as { value: string; options: Record<string, { value: MessageFormatElement[] }> };
          shape.args.add(n.value);
          if (node.type === T.plural) shape.plurals.push({ arg: n.value, options: Object.keys(n.options) });
          Object.values(n.options).forEach((o) => walk(o.value));
          break;
        }
        case T.tag: {
          const n = node as { value: string; children: MessageFormatElement[] };
          shape.tags.add(n.value);
          walk(n.children);
          break;
        }
        default:
      }
    }
  };
  walk(new IntlMessageFormat(message, locale).getAst());
  return shape;
}

describe("locale catalogues", () => {
  it("ships every locale in the list and nothing else", () => {
    expect(files.map((f) => f.replace(".json", "")).sort()).toEqual([...codes].sort());
  });

  it("covers the union of the Microsoft Store and Google Play top-20 lists", () => {
    const store = ["en-US", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "ja-JP", "zh-Hans", "zh-Hant", "ko-KR", "ru-RU", "pl-PL", "nl-NL", "tr-TR", "ar", "hi-IN", "id-ID", "vi-VN", "th-TH", "sv-SE"];
    const play = ["en-US", "hi-IN", "id-ID", "pt-BR", "es-419", "ru-RU", "ar", "tr-TR", "ja-JP", "de-DE", "fr-FR", "vi-VN", "ko-KR", "zh-Hans", "it-IT", "th-TH", "pl-PL", "bn-BD", "ur-PK", "fil-PH"];
    for (const code of [...store, ...play]) expect(codes).toContain(code);
  });

  describe.each(codes)("%s", (code) => {
    const messages = load(code);

    it("has every key, and no extra keys", () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
    });

    it("has no empty values", () => {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim().length, `${code} ${key}`).toBeGreaterThan(0);
      }
    });

    it("keeps placeholders, tags and plural structure from English", () => {
      for (const [key, source] of Object.entries(en)) {
        const expected = shapeOf(source, "en");
        const actual = shapeOf(messages[key]!, code);
        expect([...actual.args].sort(), `${code} ${key} placeholders`).toEqual([...expected.args].sort());
        expect([...actual.tags].sort(), `${code} ${key} tags`).toEqual([...expected.tags].sort());
        expect(actual.plurals.map((p) => p.arg).sort(), `${code} ${key} plurals`).toEqual(expected.plurals.map((p) => p.arg).sort());
      }
    });

    it("uses only plural categories the language has, and always `other`", () => {
      const valid = new Set(new Intl.PluralRules(code).resolvedOptions().pluralCategories);
      for (const [key, value] of Object.entries(messages)) {
        for (const plural of shapeOf(value, code).plurals) {
          expect(plural.options, `${code} ${key}`).toContain("other");
          for (const option of plural.options) {
            if (option.startsWith("=")) continue;
            expect(valid.has(option as Intl.LDMLPluralRule) || option === "other", `${code} ${key}: "${option}"`).toBe(true);
          }
        }
      }
    });

    it("keeps the product name and format tokens intact", () => {
      for (const key of ["mic.why", "pianoCheck.safety.technician"]) expect(messages[key]).toContain("Music Portal");
      expect(messages["pianoCheck.safety.note"]!.length).toBeGreaterThan(200);
    });
  });
});

describe("language detection", () => {
  it("maps device languages to the nearest shipped locale", () => {
    expect(matchLocale("de-AT")).toBe("de-DE");
    expect(matchLocale("pt-PT")).toBe("pt-BR");
    expect(matchLocale("zh-TW")).toBe("zh-Hant");
    expect(matchLocale("zh-CN")).toBe("zh-Hans");
    expect(matchLocale("zh-Hant-HK")).toBe("zh-Hant");
    expect(matchLocale("es-MX")).toBe("es-419");
    expect(matchLocale("es-ES")).toBe("es-ES");
    expect(matchLocale("ar-SA")).toBe("ar");
    expect(matchLocale("ar-EG")).toBe("ar");
    expect(matchLocale("fil")).toBe("fil-PH");
    expect(matchLocale("tl-PH")).toBe("fil-PH");
    expect(matchLocale("ur")).toBe("ur-PK");
    expect(matchLocale("bn-IN")).toBe("bn-BD");
    expect(matchLocale("en-GB")).toBe("en-US");
    expect(matchLocale("xx")).toBeNull();
  });

  it("falls back to English when nothing matches and honours order", () => {
    expect(detectLocale(["xx", "yy"])).toBe(DEFAULT_LOCALE);
    expect(detectLocale(["xx", "sv-FI", "de"])).toBe("sv-SE");
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("marks only Arabic and Urdu as right-to-left", () => {
    expect(LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code).sort()).toEqual(["ar", "ur-PK"]);
    expect(localeInfo("AR").dir).toBe("rtl");
  });
});

describe("translate", () => {
  afterEach(async () => {
    await act(() => setLocalePreference("en-US", false));
  });

  it("formats plurals per language", async () => {
    await setLocalePreference("ru-RU", false);
    expect(t("progress.days", { n: 1 })).toBe("1 день");
    expect(t("progress.days", { n: 3 })).toBe("3 дня");
    expect(t("progress.days", { n: 5 })).toBe("5 дней");
    await setLocalePreference("ar", false);
    expect(t("progress.days", { n: 2 })).toBe("يومان");
    await setLocalePreference("ja-JP", false);
    expect(t("progress.days", { n: 3 })).toContain("3");
  });

  it("falls back to English for an unknown key and to the key itself as a last resort", () => {
    expect(t("nope.missing")).toBe("nope.missing");
  });
});

describe("render smoke", () => {
  afterEach(async () => {
    await act(() => setLocalePreference("en-US", false));
  });

  const tree = () => (
    <AppearanceProvider>
      <MemoryRouter>
        <I18nProvider>
          <ForgotPasswordPage />
          <LanguageSection />
          <DailyGoalPicker value={10} onChange={() => undefined} />
          <MidiProvider>
            <VirtualPiano />
          </MidiProvider>
        </I18nProvider>
      </MemoryRouter>
    </AppearanceProvider>
  );

  it("renders in Arabic with right-to-left direction and keeps the keyboard left-to-right", async () => {
    await act(() => setLocalePreference("ar", false));
    const { container } = render(tree());
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(screen.getByRole("heading", { name: load("ar")["auth.recover.title"]! })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: load("ar")["settings.dailyGoal"]! })).toBeTruthy();
    // The keyboard is pitch-ordered, so it stays left-to-right inside the right-to-left page.
    const piano = container.querySelector('div[dir="ltr"]');
    expect(piano).not.toBeNull();
    expect(piano!.children.length).toBeGreaterThan(0);
  });

  it("renders in German with its long strings", async () => {
    await act(() => setLocalePreference("de-DE", false));
    render(tree());
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("de-DE");
    const de = load("de-DE");
    expect(screen.getByRole("heading", { name: de["auth.recover.title"]! })).toBeTruthy();
    expect(screen.getByRole("button", { name: de["auth.recover.send"]! })).toBeTruthy();
    // The longest labels in the picker are present untruncated in the DOM.
    expect(screen.getByText(de["settings.languageHint"]!)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(de["settings.goal.15"]!)).length).toBeGreaterThan(0);
  });

  it("switches language from the picker and remembers the choice", async () => {
    await act(() => setLocalePreference("en-US", true));
    render(tree());
    const select = screen.getByTestId("language-select") as HTMLSelectElement;
    expect(select.value).toBe("en-US");
    expect(select.options.length).toBe(LOCALES.length + 1);
    await act(async () => {
      select.value = "ar";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.documentElement.dir).toBe("rtl");
    expect(localStorage.getItem("ks-locale")).toBe("ar");
    await act(() => setLocalePreference("auto"));
    expect(localStorage.getItem("ks-locale")).toBeNull();
  });
});
