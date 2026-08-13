import type { TemplateField, TemplateFieldValue } from "../../src/types/index.js";
import { htmlToPlainText } from "./field-policy.js";

export const APPEND_ONLY_SYSTEM_INSTRUCTION =
  "当 mode 为 append 时，只返回新增内容，不得重复现有字段值中的任何项目或段落。";

function comparableText(value: string): string {
  return htmlToPlainText(value).replace(/\s+/g, " ").trim();
}

/** Reject append candidates that replay material already present in the target field. */
export function appendCandidateRepeatsCurrentValue(
  currentValue: unknown,
  candidateValue: TemplateFieldValue,
  field: TemplateField,
): boolean {
  if (field.type === "bullet_list") {
    if (!Array.isArray(currentValue) || !Array.isArray(candidateValue)) return false;
    const existingItems = new Set(
      currentValue
        .filter((item): item is string => typeof item === "string")
        .map(comparableText)
        .filter(Boolean),
    );
    return candidateValue.some((item) => existingItems.has(comparableText(item)));
  }

  if (field.type !== "rich_text" || typeof currentValue !== "string") return false;
  const existingText = comparableText(currentValue);
  return (
    existingText !== "" &&
    typeof candidateValue === "string" &&
    comparableText(candidateValue).includes(existingText)
  );
}
