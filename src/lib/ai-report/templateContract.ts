import type {
  AiBlockField,
  AiSource,
  GenerationMode,
  GenerationScope,
  ReportTemplateVersion,
  TemplateField,
  TemplateFieldType,
  TemplateFieldValue,
} from "../../types/index.js";
import { AI_BLOCK_FIELDS } from "../../types/index.js";

const FIELD_TYPES = new Set<TemplateFieldType>([
  "rich_text",
  "bullet_list",
  "short_text",
  "image",
  "fixed",
]);
const AI_SOURCES = new Set<AiSource>([
  "transcript",
  "current_draft",
  "calendar",
  "user_focus",
  "report_content",
]);
const GENERATION_MODES = new Set<GenerationMode>(["rewrite", "append"]);
const AI_BLOCK_FIELD_IDS = new Set<AiBlockField>(AI_BLOCK_FIELDS);

const RESERVED_AI_FIELD_IDS = {
  daily: new Set([
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
    "rumorsBlocks",
    "sections",
    "citations",
    "onsiteEvents",
    "sourceReports",
    "templateId",
    "templateVersion",
    "templateHash",
  ]),
  session: new Set([
    "speakers",
    "speaker",
    "company",
    "illustration",
    "illustrations",
    "lastEditedBy",
    "lastEditedAt",
    "calendarSessionId",
    "transcriptRef",
  ]),
  block: new Set<string>(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertUniqueValues<T>(values: T[], kind: string): void {
  if (new Set(values).size !== values.length) throw new Error(`duplicate AI ${kind}`);
}

export function assertTemplateVersion(value: unknown): ReportTemplateVersion {
  if (!isRecord(value)) throw new Error("invalid template version");
  const template = value as Partial<ReportTemplateVersion>;
  if (
    typeof template.templateId !== "string" ||
    template.templateId.length === 0 ||
    !Number.isInteger(template.version) ||
    (template.version as number) <= 0 ||
    typeof template.templateHash !== "string" ||
    template.templateHash.length === 0
  ) {
    throw new Error("invalid immutable template identity");
  }
  if (!Array.isArray(template.fields)) throw new Error("template fields must be an array");

  const ids = new Set<string>();
  for (const rawField of template.fields) {
    if (!isRecord(rawField)) throw new Error("invalid template field");
    const field = rawField as unknown as TemplateField;
    if (
      typeof field.id !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.id) ||
      typeof field.label !== "string" ||
      field.label.length === 0 ||
      typeof field.description !== "string" ||
      field.description.length === 0 ||
      !FIELD_TYPES.has(field.type)
    ) {
      throw new Error("invalid template field");
    }
    if (field.scope !== "session" && field.scope !== "daily" && field.scope !== "block") {
      throw new Error(`invalid field scope: ${field.id}`);
    }
    if (field.scope === "block") {
      if (!AI_BLOCK_FIELD_IDS.has(field.id as AiBlockField)) {
        throw new Error(`invalid AI Block field: ${field.id}`);
      }
      if (field.type !== "rich_text") {
        throw new Error(`invalid AI Block field type: ${field.id}`);
      }
    }
    if (ids.has(field.id)) throw new Error(`duplicate template field: ${field.id}`);
    ids.add(field.id);

    if (!isRecord(field.ai)) throw new Error(`invalid AI policy: ${field.id}`);
    const ai = field.ai as unknown as Record<string, unknown>;
    if (
      typeof ai.enabled !== "boolean" ||
      typeof ai.evidenceRequired !== "boolean" ||
      !Array.isArray(ai.allowedSources) ||
      !Array.isArray(ai.allowedModes)
    ) {
      throw new Error(`invalid AI policy: ${field.id}`);
    }
    if (ai.instruction !== undefined && typeof ai.instruction !== "string") {
      throw new Error(`invalid AI instruction: ${field.id}`);
    }
    for (const source of ai.allowedSources) {
      if (!AI_SOURCES.has(source as AiSource)) throw new Error(`invalid AI source: ${field.id}`);
    }
    for (const mode of ai.allowedModes) {
      if (!GENERATION_MODES.has(mode as GenerationMode))
        throw new Error(`invalid AI mode: ${field.id}`);
    }
    assertUniqueValues(ai.allowedSources, "source");
    assertUniqueValues(ai.allowedModes, "mode");

    for (const limit of ["minItems", "maxItems", "maxLength"] as const) {
      if (ai[limit] !== undefined && (!Number.isInteger(ai[limit]) || (ai[limit] as number) <= 0)) {
        throw new Error(`invalid AI limit: ${field.id}`);
      }
    }
    if (ai.minItems !== undefined || ai.maxItems !== undefined) {
      if (field.type !== "bullet_list")
        throw new Error(`item limits require bullet_list: ${field.id}`);
      if (
        ai.minItems !== undefined &&
        ai.maxItems !== undefined &&
        (ai.minItems as number) > (ai.maxItems as number)
      ) {
        throw new Error(`minItems cannot exceed maxItems: ${field.id}`);
      }
    }
    if (
      (field.type === "short_text" || field.type === "image" || field.type === "fixed") &&
      ai.allowedModes.includes("append" as GenerationMode)
    ) {
      throw new Error(`append is not allowed: ${field.id}`);
    }
    if ((field.type === "image" || field.type === "fixed") && ai.enabled) {
      throw new Error("image and fixed fields cannot enable AI");
    }
    if (ai.enabled && RESERVED_AI_FIELD_IDS[field.scope as GenerationScope].has(field.id)) {
      throw new Error(`reserved AI field: ${field.id}`);
    }
  }
  return template as ReportTemplateVersion;
}

export function selectEligibleFields(
  template: ReportTemplateVersion,
  scope: GenerationScope,
  mode: GenerationMode,
): TemplateField[] {
  return template.fields.filter(
    (field) =>
      field.scope === scope &&
      field.ai.enabled &&
      field.type !== "image" &&
      field.type !== "fixed" &&
      field.ai.allowedModes.includes(mode),
  );
}

export function normalizeStoredFieldValue(
  field: TemplateField,
  value: unknown,
): TemplateFieldValue {
  if (field.type === "bullet_list") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }
  return typeof value === "string" ? value : "";
}
