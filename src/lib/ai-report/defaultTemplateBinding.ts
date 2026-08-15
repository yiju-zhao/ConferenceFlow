import { stripHtml } from "../diffUtils";
import type { ConferenceType, Report, ReportTemplateVersion } from "../../types";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING } from "./templates/industryConferenceDailyReport";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING } from "./templates/academicConferenceDailyReport";

const LEGACY_RUMORS_BLOCK_ID = "legacy-rumors-v1";

export function reportTemplateBindingState(
  report: Partial<Report>,
): "unbound" | "partial" | "bound" {
  const values = [report.templateId, report.templateVersion, report.templateHash];
  if (values.every((value) => value === undefined)) return "unbound";
  if (values.every((value) => value !== undefined)) return "bound";
  return "partial";
}

function isCanonicalV1(template: ReportTemplateVersion): boolean {
  return (
    template.templateId === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateId &&
    template.version === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateVersion &&
    template.templateHash === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateHash
  );
}

export function defaultTemplateBindingPatch(
  report: Partial<Report>,
  template: ReportTemplateVersion,
): Partial<Report> | null {
  if (reportTemplateBindingState(report) !== "unbound" || !isCanonicalV1(template)) return null;

  const rumorsBlocks =
    report.rumorsBlocks && report.rumorsBlocks.length > 0
      ? report.rumorsBlocks
      : stripHtml(report.rumors).trim()
        ? [{ id: LEGACY_RUMORS_BLOCK_ID, type: "body" as const, content: report.rumors ?? "" }]
        : [];

  return { ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING, rumorsBlocks };
}

export function bindingForConferenceType(type: ConferenceType | undefined) {
  return type === "academic"
    ? ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING
    : INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING;
}
