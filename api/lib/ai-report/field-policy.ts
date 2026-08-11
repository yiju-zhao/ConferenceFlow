import type {
  GenerationMode,
  Report,
  TemplateField,
  TemplateFieldType,
  TemplateFieldValue,
} from "../../../src/types";

export interface SourceBlock {
  sourceId: string;
  sourceType: "report_field" | "current_draft";
  text: string;
}

type ReportLike = Partial<Report> | Record<string, unknown>;

const DAILY_METADATA_FIELDS = new Set([
  "id",
  "type",
  "status",
  "publishedAt",
  "publishedUrl",
  "date",
  "sitePhotos",
  "sessions",
  "topicOrder",
  "deletedSessions",
  "onsiteInfoBlocks",
  "reflectionsBlocks",
  "sections",
  "citations",
  "onsiteEvents",
  "sourceReports",
  "templateId",
  "templateVersion",
  "templateHash",
  "aiFocus",
  "focus",
  "presence",
  "publication",
  "publicationMetadata",
]);
const SESSION_METADATA_FIELDS = new Set([
  "speakers",
  "speaker",
  "company",
  "illustration",
  "illustrations",
  "lastEditedBy",
  "lastEditedAt",
  "calendarSessionId",
  "transcriptRef",
  "focus",
  "aiFocus",
  "presence",
  "participants",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainText(value: string, singleLine: boolean): boolean {
  if (
    value.trim() === "" ||
    /<[^>]*>/.test(value) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)
  )
    return false;
  return !singleLine || !/[\r\n]/.test(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function policyError(message: string): never {
  throw new Error(message);
}

/** Validate an untrusted model value against the immutable field contract. */
export function validateCandidateValue(value: unknown, field: TemplateField): TemplateFieldValue {
  if (field.type === "fixed" || field.type === "image") {
    return policyError(`${field.type} fields cannot be AI targets`);
  }

  if (field.type === "bullet_list") {
    if (!Array.isArray(value)) return policyError("expected bullet_list");
    if (
      value.length === 0 ||
      value.some((item) => typeof item !== "string" || !isPlainText(item, true))
    ) {
      return policyError("expected non-empty bullet_list");
    }
    if (field.ai.minItems !== undefined && value.length < field.ai.minItems) {
      return policyError("too few items");
    }
    if (field.ai.maxItems !== undefined && value.length > field.ai.maxItems) {
      return policyError("too many items");
    }
    const result = value as string[];
    if (
      field.ai.maxLength !== undefined &&
      result.reduce((length, item) => length + codePointLength(item), 0) > field.ai.maxLength
    ) {
      return policyError("value too long");
    }
    return [...result];
  }

  if (typeof value !== "string") return policyError(`expected ${field.type}`);
  if (!isPlainText(value, field.type === "short_text"))
    return policyError("expected non-empty plain text");
  if (field.ai.maxLength !== undefined && codePointLength(value) > field.ai.maxLength) {
    return policyError("value too long");
  }
  return value;
}

/** Read a stored value from the authoritative report document only. */
export function readReportFieldValue(
  report: ReportLike,
  fieldId: string,
  sessionId?: string,
): unknown {
  if (sessionId !== undefined) {
    const sessions = report.sessions;
    const session =
      sessions && typeof sessions === "object"
        ? (sessions as Record<string, unknown>)[sessionId]
        : undefined;
    return isObject(session) ? session[fieldId] : undefined;
  }
  return (report as Record<string, unknown>)[fieldId];
}

function toSourceText(value: unknown): string {
  const raw = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join("\n")
    : typeof value === "string"
      ? value
      : "";
  if (!raw.trim()) return "";
  return htmlToPlainText(raw).trim();
}

/** Convert the limited editor HTML currently stored in report fields to text. */
export function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<(?:p|div|li|h[1-6])(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#039|nbsp);/gi, (entity) => {
      switch (entity.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
        case "&#39;":
          return "'";
        case "&#039;":
          return "'";
        case "&nbsp;":
          return " ";
        default:
          return entity;
      }
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function aiReadableField(
  field: TemplateField,
  source: "current_draft" | "report_content",
  mode?: GenerationMode,
): boolean {
  return (
    field.ai.enabled &&
    field.type !== "fixed" &&
    field.type !== "image" &&
    field.ai.allowedSources.includes(source) &&
    (mode === undefined || field.ai.allowedModes.includes(mode))
  );
}

/** Build deterministic current-draft blocks for a Session generation. */
export function buildSessionDraftBlocks(
  fields: TemplateField[],
  currentValues: Record<string, unknown>,
  mode: GenerationMode = "rewrite",
): SourceBlock[] {
  return fields
    .filter(
      (field) =>
        field.scope === "session" &&
        !SESSION_METADATA_FIELDS.has(field.id) &&
        aiReadableField(field, "current_draft", mode),
    )
    .map((field) => ({
      field,
      text: toSourceText(currentValues[field.id]),
    }))
    .filter(({ text }) => text.length > 0)
    .map(({ field, text }) => ({
      sourceId: `draft:${field.id}`,
      sourceType: "current_draft",
      text,
    }));
}

/** Build deterministic daily source blocks from the report's current values. */
export function buildDailySourceBlocks(
  report: ReportLike,
  fields: TemplateField[],
  targetFieldId: string | TemplateField,
): SourceBlock[] {
  const targetId = typeof targetFieldId === "string" ? targetFieldId : targetFieldId.id;
  const target = fields.find((field) => field.id === targetId);
  if (!target || target.scope !== "daily" || !aiReadableField(target, "report_content")) return [];
  const blocks: SourceBlock[] = [];
  for (const field of fields) {
    if (
      field.id === targetId ||
      DAILY_METADATA_FIELDS.has(field.id) ||
      !field.ai.enabled ||
      field.type === "fixed" ||
      field.type === "image" ||
      field.scope !== "daily"
    )
      continue;
    const text = toSourceText(readReportFieldValue(report, field.id));
    if (text) blocks.push({ sourceId: `report:${field.id}`, sourceType: "report_field", text });
  }

  const sessions = report.sessions;
  if (!sessions || typeof sessions !== "object") return blocks;
  for (const sessionId of Object.keys(sessions).sort()) {
    for (const field of fields) {
      if (
        field.id === targetId ||
        SESSION_METADATA_FIELDS.has(field.id) ||
        !field.ai.enabled ||
        field.type === "fixed" ||
        field.type === "image" ||
        field.scope !== "session"
      )
        continue;
      const text = toSourceText(readReportFieldValue(report, field.id, sessionId));
      if (text)
        blocks.push({
          sourceId: `session:${sessionId}:${field.id}`,
          sourceType: "report_field",
          text,
        });
    }
  }
  return blocks;
}

export type SupportedGeneratedFieldType = Exclude<TemplateFieldType, "image" | "fixed">;
