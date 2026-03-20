import catalogData from "../data/gtc-2026-sessions-detailed.json";

// ── Session catalog ─────────────────────────────────────────────────────────
export const SESSION_CATALOG = new Map(catalogData.map((s) => [s.session_id, s]));

// ── Report version helpers ──────────────────────────────────────────────────
export function parseReportId(reportId) {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2]), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}

export function latestOrNewVersionId(date, allDocs) {
  if (allDocs.some(r => r.id === date)) return date;
  const vDocs = allDocs.filter(r => parseReportId(r.id).date === date);
  if (vDocs.length > 0) {
    const maxV = vDocs.reduce((max, r) => Math.max(max, parseReportId(r.id).version), 0);
    return `${date}-v${maxV}`;
  }
  return date;
}

// ── Member color palette (light-theme tuned) ────────────────────────────────
export const COLORS = [
  { hex: "#CF0A2C", bg: "rgba(207,10,44,0.08)",  glow: "rgba(207,10,44,0.20)" },
  { hex: "#2980B9", bg: "rgba(41,128,185,0.10)",  glow: "rgba(41,128,185,0.25)" },
  { hex: "#E67E22", bg: "rgba(230,126,34,0.10)",  glow: "rgba(230,126,34,0.25)" },
  { hex: "#8E44AD", bg: "rgba(142,68,173,0.10)",  glow: "rgba(142,68,173,0.25)" },
  { hex: "#27AE60", bg: "rgba(39,174,96,0.10)",   glow: "rgba(39,174,96,0.25)" },
  { hex: "#2C3E50", bg: "rgba(44,62,80,0.08)",    glow: "rgba(44,62,80,0.20)" },
];

// ── Color presets for rich text formatting ───────────────────────────────────
export const COLOR_PRESETS = ["#333333", "#CF0A2C", "#E67E22", "#27AE60", "#2980B9", "#8E44AD"];

// ── Chinese day names ───────────────────────────────────────────────────────
export const DAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
