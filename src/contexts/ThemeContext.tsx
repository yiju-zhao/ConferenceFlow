import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ThemeContextValue {
  dark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "cf-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY) === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("bp6-dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);

  return <ThemeContext.Provider value={{ dark, toggleDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
