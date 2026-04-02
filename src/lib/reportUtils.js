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

// ── Summary ID generator ─────────────────────────────────────────────────────
export function generateSummaryId(existingDocs) {
  const summaryDocs = existingDocs
    .filter(d => d.id.startsWith("summary-GTC2026"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (summaryDocs.length === 0) return "summary-GTC2026";
  const versions = summaryDocs.map(d => {
    const m = d.id.match(/-v(\d+)$/);
    return m ? parseInt(m[1]) : 1;
  });
  return `summary-GTC2026-v${Math.max(...versions) + 1}`;
}

// ── Shared helper: get initials from name ────────────────────────────────────
export function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return parts.map(p => p[0]).join("").toUpperCase().substring(0, 3);
}

// ── Shared helper: generate unique ID ────────────────────────────────────────
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
