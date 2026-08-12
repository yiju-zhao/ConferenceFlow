/** Normalize only whitespace for quote matching across transcript and report sources. */
export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
