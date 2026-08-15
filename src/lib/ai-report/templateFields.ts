import type { ReportTemplateVersion, TemplateField } from "../../types";

export function templateHasField(
  template: ReportTemplateVersion | null,
  fieldId: string,
): boolean {
  return Boolean(template?.fields.some((field) => field.id === fieldId));
}

export function sessionContentFieldsOf(
  template: ReportTemplateVersion | null,
): TemplateField[] | null {
  if (!template) return null;
  return template.fields.filter(
    (field) => field.scope === "session" && field.type !== "fixed" && field.type !== "image",
  );
}
