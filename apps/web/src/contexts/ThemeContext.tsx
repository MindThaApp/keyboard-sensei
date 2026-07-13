import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
export type Theme = "light" | "dark" | "midnight";
export type AccentTheme = "felt" | "ocean" | "forest" | "violet";
const THEME_STORAGE_KEY = "keyboard-sensei-theme";
const ACCENT_STORAGE_KEY = "keyboard-sensei-accent-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "midnight";
}

function isAccentTheme(value: string | null): value is AccentTheme {
  return value === "felt" || value === "ocean" || value === "forest" || value === "violet";
}

interface ThemeContextValue {
  theme: Theme;
  setTheme(theme: Theme): void;
  accentTheme: AccentTheme;
  setAccentTheme(theme: AccentTheme): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "light";
  });
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccentTheme(stored) ? stored : "felt";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme !== "light");
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accentTheme;
    localStorage.setItem(ACCENT_STORAGE_KEY, accentTheme);
  }, [accentTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, accentTheme, setAccentTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme requires ThemeProvider"); return value; }
