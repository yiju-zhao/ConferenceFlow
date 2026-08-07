import { createContext, useContext, type ReactNode } from "react";

export type AccentKey = "dash" | "cal" | "report" | "admin" | "none";

/** Area identity colors. Keep in sync with `--accent-*` in src/index.css. */
export const ACCENT_HEX: Record<AccentKey, string> = {
  dash: "#4A7FB5",
  cal: "#E8976B",
  report: "#cf0a2c",
  admin: "#5E8B7E",
  none: "#2D72D2",
};

interface SectionAccentValue {
  accent: AccentKey;
  hex: string;
}

const SectionAccentContext = createContext<SectionAccentValue>({
  accent: "none",
  hex: ACCENT_HEX.none,
});

export function SectionAccentProvider({
  accent,
  children,
}: {
  accent: AccentKey;
  children: ReactNode;
}) {
  return (
    <SectionAccentContext.Provider value={{ accent, hex: ACCENT_HEX[accent] }}>
      <div data-accent={accent} style={{ display: "contents" }}>
        {children}
      </div>
    </SectionAccentContext.Provider>
  );
}

export function useSectionAccent(): SectionAccentValue {
  return useContext(SectionAccentContext);
}
