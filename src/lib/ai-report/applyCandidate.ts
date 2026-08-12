import type { GenerationMode, TemplateFieldType, TemplateFieldValue } from "../../types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function plainTextToSafeHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function applyCandidateValue(
  current: TemplateFieldValue,
  candidate: TemplateFieldValue,
  type: TemplateFieldType,
  mode: GenerationMode,
): TemplateFieldValue {
  if (type === "bullet_list") {
    const next = candidate as string[];
    if (mode === "rewrite") return next;
    const existing = current as string[];
    const seen = new Set(existing.map((item) => item.trim().replace(/\s+/g, " ")));
    const additions = next.filter((item) => {
      const normalized = item.trim().replace(/\s+/g, " ");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    return [...existing, ...additions];
  }
  if (type === "rich_text") {
    const next = plainTextToSafeHtml(candidate as string);
    if (mode === "rewrite" || !current) return next;
    if ((current as string).includes(next)) return current;
    return `${current}<p><br></p>${next}`;
  }
  return candidate as string;
}

export function candidateIsCurrent(
  expectedFields: Record<string, string>,
  currentFields: Record<string, string>,
  expectedTranscriptHash?: string,
  currentTranscriptHash?: string,
): boolean {
  return (
    Object.entries(expectedFields).every(([id, hash]) => currentFields[id] === hash) &&
    expectedTranscriptHash === currentTranscriptHash
  );
}
