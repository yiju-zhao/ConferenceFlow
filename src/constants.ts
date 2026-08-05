interface ColorEntry {
  hex: string;
  bg: string;
  glow: string;
}

export const COLORS: ColorEntry[] = [
  { hex: "#CF0A2C", bg: "rgba(207,10,44,0.08)", glow: "rgba(207,10,44,0.20)" },
  { hex: "#2980B9", bg: "rgba(41,128,185,0.10)", glow: "rgba(41,128,185,0.25)" },
  { hex: "#E67E22", bg: "rgba(230,126,34,0.10)", glow: "rgba(230,126,34,0.25)" },
  { hex: "#8E44AD", bg: "rgba(142,68,173,0.10)", glow: "rgba(142,68,173,0.25)" },
  { hex: "#27AE60", bg: "rgba(39,174,96,0.10)", glow: "rgba(39,174,96,0.25)" },
  { hex: "#2C3E50", bg: "rgba(44,62,80,0.08)", glow: "rgba(44,62,80,0.20)" },
];

export const COLOR_PRESETS: string[] = [
  "#333333",
  "#CF0A2C",
  "#E67E22",
  "#27AE60",
  "#2980B9",
  "#8E44AD",
];
