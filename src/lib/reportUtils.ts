export interface ParsedReportId {
  date: string;
  version: number;
  isLegacy: boolean;
}

export function parseReportId(reportId: string): ParsedReportId {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2], 10), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}

export function generateSummaryId(existingDocs: { id: string }[]): string {
  const summaryDocs = existingDocs
    .filter((d) => d.id.startsWith("summary-GTC2026"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (summaryDocs.length === 0) return "summary-GTC2026";
  const versions = summaryDocs.map((d) => {
    const m = d.id.match(/-v(\d+)$/);
    return m ? parseInt(m[1], 10) : 1;
  });
  return `summary-GTC2026-v${Math.max(...versions) + 1}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .substring(0, 3);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
