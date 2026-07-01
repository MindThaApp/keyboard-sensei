import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
export type Theme = "light" | "dark" | "midnight";
const ThemeContext = createContext<{ theme: Theme; setTheme(theme: Theme): void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("keyboard-sensei-theme") as Theme | null) ?? "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle("dark", theme !== "light"); localStorage.setItem("keyboard-sensei-theme", theme); }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme requires ThemeProvider"); return value; }
