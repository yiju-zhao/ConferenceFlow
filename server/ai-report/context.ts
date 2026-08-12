import type { Bucket } from "@google-cloud/storage";
import type { Firestore } from "firebase-admin/firestore";
import type {
  AiBlockField,
  GenerateRequest,
  GenerationMode,
  Report,
  ReportTemplateVersion,
  TemplateField,
} from "../../src/types";
import { blockContentHashKey } from "../../src/lib/ai-report/blockTarget";
import { hashFieldMap, hashText } from "../../src/lib/ai-report/hash";
import {
  assertTemplateVersion,
  normalizeStoredFieldValue,
  selectEligibleFields,
} from "../../src/lib/ai-report/templateContract";
import { bucket, db } from "../../api/lib/firebase-admin.js";
import { buildDailySourceBlocks, readReportFieldValue } from "./field-policy";
import type { DailyGenerationInput } from "./generate-daily";
import type { SessionGenerationInput } from "./generate-session";
import {
  normalizeTranscriptSource,
  parseTranscript,
  type TranscriptSegment,
} from "./transcript-parser";

export interface BlockGenerationInput {
  template: ReportTemplateVersion;
  field: TemplateField;
  targetFieldId: AiBlockField;
  blockId: string;
  blockKind: "heading" | "body";
  currentValue: string;
  segments: TranscriptSegment[];
  focus: string;
  mode: GenerationMode;
  instruction: string;
  templateHash: string;
  transcriptHash?: string;
  baseFieldHashes: Record<string, string>;
}

export interface GenerationContextSource {
  getReport(confId: string, reportId: string): Promise<Report | null>;
  getTemplate(templateId: string, version: number): Promise<unknown | null>;
  getMemberFocus(confId: string, uid: string): Promise<string>;
  getCalendarSession(
    confId: string,
    calendarSessionId: string | undefined,
    fallbackCode: string,
  ): Promise<Record<string, unknown> | null>;
  getTranscript(storagePath: string): Promise<Uint8Array>;
}

export type LoadedGenerationContext =
  | { scope: "session"; input: SessionGenerationInput }
  | { scope: "daily"; input: DailyGenerationInput }
  | { scope: "block"; input: BlockGenerationInput };

const PUBLIC_ERRORS = {
  REPORT_NOT_FOUND: [404, "Report not found"],
  TEMPLATE_NOT_BOUND: [409, "Report has no immutable template binding"],
  TEMPLATE_NOT_FOUND: [404, "Bound template version not found"],
  TEMPLATE_MISMATCH: [409, "Template identity/hash changed"],
  SESSION_NOT_FOUND: [404, "Report Session or Calendar Session not found"],
  BLOCK_NOT_FOUND: [404, "Report Block not found"],
  BLOCK_DUPLICATE: [409, "Report Block identity is ambiguous"],
  TRANSCRIPT_REQUIRED: [400, "A required generation source is missing"],
  TRANSCRIPT_PATH_MISMATCH: [409, "Transcript path is outside the bound Session"],
  BLOCK_TRANSCRIPT_PATH_MISMATCH: [409, "Transcript path is outside the bound Block"],
  TRANSCRIPT_HASH_MISMATCH: [409, "Transcript changed after reference creation"],
  INVALID_TRANSCRIPT: [400, "Transcript encoding/format/size is invalid"],
  FIELD_NOT_ELIGIBLE: [400, "Target field or requested mode is not allowed"],
} as const;

export type GenerationContextErrorCode = keyof typeof PUBLIC_ERRORS;

export class GenerationContextError extends Error {
  readonly status: number;
  readonly publicMessage: string;

  constructor(public readonly code: GenerationContextErrorCode) {
    const [status, publicMessage] = PUBLIC_ERRORS[code];
    super(publicMessage);
    this.name = "GenerationContextError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundTemplate(report: Report, value: unknown): ReportTemplateVersion {
  if (
    typeof report.templateId !== "string" ||
    report.templateId.length === 0 ||
    !Number.isInteger(report.templateVersion) ||
    (report.templateVersion ?? 0) <= 0 ||
    typeof report.templateHash !== "string" ||
    report.templateHash.length === 0
  ) {
    throw new GenerationContextError("TEMPLATE_NOT_BOUND");
  }
  let template: ReportTemplateVersion;
  try {
    template = assertTemplateVersion(value);
  } catch {
    throw new GenerationContextError("TEMPLATE_MISMATCH");
  }
  if (
    template.templateId !== report.templateId ||
    template.version !== report.templateVersion ||
    template.templateHash !== report.templateHash
  ) {
    throw new GenerationContextError("TEMPLATE_MISMATCH");
  }
  return template;
}

function normalizedValues(
  report: Report,
  fields: TemplateField[],
  sessionId?: string,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      normalizeStoredFieldValue(field, readReportFieldValue(report, field.id, sessionId)),
    ]),
  );
}

function transcriptPrefix(confId: string, reportId: string, sessionId: string): string {
  return `conference-transcripts/${safePathSegment(confId)}/${safePathSegment(reportId)}/${safePathSegment(sessionId)}/`;
}

function blockTranscriptPrefix(
  confId: string,
  reportId: string,
  targetFieldId: AiBlockField,
  blockId: string,
): string {
  return `conference-transcripts/${safePathSegment(confId)}/${safePathSegment(reportId)}/blocks/${safePathSegment(targetFieldId)}/${safePathSegment(blockId)}/`;
}

function transcriptFormat(value: unknown): "txt" | "md" | "srt" | "vtt" {
  if (value === "txt" || value === "md" || value === "srt" || value === "vtt") return value;
  throw new GenerationContextError("INVALID_TRANSCRIPT");
}

function publicString(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    Array.from(normalized).length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function publicSpeakers(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const speakers = value.slice(0, 50).flatMap((speaker) => {
    if (!isRecord(speaker)) return [];
    const publicSpeaker = Object.fromEntries(
      (["name", "title", "company"] as const).flatMap((key) => {
        const text = publicString(speaker[key]);
        return text === undefined ? [] : [[key, text]];
      }),
    );
    return Object.keys(publicSpeaker).length === 0 ? [] : [publicSpeaker];
  });
  return speakers.length > 0 ? speakers : undefined;
}

function fixedCalendarContext(session: Record<string, unknown>): Record<string, unknown> {
  const scalar = ["code", "title", "date", "start", "end", "room"] as const;
  const context = Object.fromEntries(
    scalar.flatMap((key) => {
      const text = publicString(session[key]);
      return text === undefined ? [] : [[key, text]];
    }),
  );
  const speakers = publicSpeakers(session.speakers);
  return speakers === undefined ? context : { ...context, speakers };
}

function usableCalendarSessionId(value: unknown): string | undefined {
  const id = publicString(value);
  return id === undefined || id.includes("/") ? undefined : id;
}

function sessionFromReport(report: Report, sessionId: string): Record<string, unknown> {
  const session = report.sessions?.[sessionId];
  if (!isRecord(session)) throw new GenerationContextError("SESSION_NOT_FOUND");
  return session;
}

export async function loadGenerationContext(
  {
    confId,
    reportId,
    uid,
    request,
  }: { confId: string; reportId: string; uid: string; request: GenerateRequest },
  source: GenerationContextSource = firebaseGenerationContextSource,
): Promise<LoadedGenerationContext> {
  const report = await source.getReport(confId, reportId);
  if (!report) throw new GenerationContextError("REPORT_NOT_FOUND");
  const templateVersion = report.templateVersion;
  if (
    typeof report.templateId !== "string" ||
    report.templateId.length === 0 ||
    !Number.isInteger(templateVersion) ||
    (templateVersion ?? 0) <= 0 ||
    typeof report.templateHash !== "string" ||
    report.templateHash.length === 0
  ) {
    throw new GenerationContextError("TEMPLATE_NOT_BOUND");
  }
  const rawTemplate = await source.getTemplate(report.templateId, templateVersion as number);
  if (!rawTemplate) throw new GenerationContextError("TEMPLATE_NOT_FOUND");
  const template = boundTemplate(report, rawTemplate);
  const focus = await source.getMemberFocus(confId, uid);

  if (request.scope === "daily") {
    const field = selectEligibleFields(template, "daily", request.mode).find(
      (candidate) => candidate.id === request.targetFieldId,
    );
    if (!field) throw new GenerationContextError("FIELD_NOT_ELIGIBLE");
    const values = normalizedValues(report, [field]);
    return {
      scope: "daily",
      input: {
        template,
        field,
        currentValue: values[field.id],
        sourceBlocks: buildDailySourceBlocks(report, template.fields, field),
        focus,
        mode: request.mode,
        instruction: request.instruction ?? "",
        templateHash: template.templateHash,
        baseFieldHashes: await hashFieldMap(values),
      },
    };
  }

  if (request.scope === "block") {
    const field = selectEligibleFields(template, "block", request.mode).find(
      (candidate) => candidate.id === request.targetFieldId,
    );
    if (!field) throw new GenerationContextError("FIELD_NOT_ELIGIBLE");

    const blocks = report[request.targetFieldId];
    const matches = Array.isArray(blocks)
      ? blocks.filter((block) => isRecord(block) && block.id === request.blockId)
      : [];
    if (matches.length === 0) throw new GenerationContextError("BLOCK_NOT_FOUND");
    if (matches.length > 1) throw new GenerationContextError("BLOCK_DUPLICATE");

    const block = matches[0];
    if (block.type !== "heading" && block.type !== "body") {
      throw new GenerationContextError("BLOCK_NOT_FOUND");
    }
    if (block.type === "heading" && request.mode === "append") {
      throw new GenerationContextError("FIELD_NOT_ELIGIBLE");
    }
    const normalizedContent = normalizeStoredFieldValue(field, block.content);
    const currentValue = typeof normalizedContent === "string" ? normalizedContent : "";
    const transcriptRef = block.transcriptRef;
    let segments: TranscriptSegment[] = [];
    let transcriptHash: string | undefined;

    if (transcriptRef !== undefined && transcriptRef !== null) {
      if (!isRecord(transcriptRef)) throw new GenerationContextError("INVALID_TRANSCRIPT");
      const storagePath = transcriptRef.storagePath;
      if (
        typeof storagePath !== "string" ||
        !storagePath.startsWith(
          blockTranscriptPrefix(confId, reportId, request.targetFieldId, request.blockId),
        )
      ) {
        throw new GenerationContextError("BLOCK_TRANSCRIPT_PATH_MISMATCH");
      }
      if (typeof transcriptRef.contentHash !== "string" || !transcriptRef.contentHash) {
        throw new GenerationContextError("TRANSCRIPT_REQUIRED");
      }
      const format = transcriptFormat(transcriptRef.format);
      if (!storagePath.toLowerCase().endsWith(`.${format}`)) {
        throw new GenerationContextError("INVALID_TRANSCRIPT");
      }

      let transcriptText: string;
      try {
        transcriptText = normalizeTranscriptSource(
          new TextDecoder("utf-8", { fatal: true }).decode(await source.getTranscript(storagePath)),
        );
      } catch (error) {
        if (error instanceof GenerationContextError) throw error;
        throw new GenerationContextError("INVALID_TRANSCRIPT");
      }
      if ((await hashText(transcriptText)) !== transcriptRef.contentHash) {
        throw new GenerationContextError("TRANSCRIPT_HASH_MISMATCH");
      }
      try {
        segments = parseTranscript(format, transcriptText);
      } catch {
        throw new GenerationContextError("INVALID_TRANSCRIPT");
      }
      transcriptHash = transcriptRef.contentHash;
    } else if (!currentValue.trim()) {
      throw new GenerationContextError("TRANSCRIPT_REQUIRED");
    }

    const hashKey = blockContentHashKey(request.targetFieldId, request.blockId);
    return {
      scope: "block",
      input: {
        template,
        field,
        targetFieldId: request.targetFieldId,
        blockId: request.blockId,
        blockKind: block.type,
        currentValue,
        segments,
        focus,
        mode: request.mode,
        instruction: request.instruction ?? "",
        templateHash: template.templateHash,
        ...(transcriptHash === undefined ? {} : { transcriptHash }),
        baseFieldHashes: await hashFieldMap({ [hashKey]: currentValue }),
      },
    };
  }

  const fields = selectEligibleFields(template, "session", request.mode);
  if (fields.length === 0) throw new GenerationContextError("FIELD_NOT_ELIGIBLE");
  const session = sessionFromReport(report, request.sessionId);
  const transcriptRef = session.transcriptRef;
  if (!isRecord(transcriptRef)) throw new GenerationContextError("TRANSCRIPT_REQUIRED");
  const storagePath = transcriptRef.storagePath;
  if (
    typeof storagePath !== "string" ||
    !storagePath.startsWith(transcriptPrefix(confId, reportId, request.sessionId))
  ) {
    throw new GenerationContextError("TRANSCRIPT_PATH_MISMATCH");
  }
  if (typeof transcriptRef.contentHash !== "string" || !transcriptRef.contentHash) {
    throw new GenerationContextError("TRANSCRIPT_REQUIRED");
  }
  const format = transcriptFormat(transcriptRef.format);
  if (!storagePath.toLowerCase().endsWith(`.${format}`)) {
    throw new GenerationContextError("INVALID_TRANSCRIPT");
  }

  let transcriptText: string;
  try {
    transcriptText = normalizeTranscriptSource(
      new TextDecoder("utf-8", { fatal: true }).decode(await source.getTranscript(storagePath)),
    );
  } catch (error) {
    if (error instanceof GenerationContextError) throw error;
    throw new GenerationContextError("INVALID_TRANSCRIPT");
  }
  if ((await hashText(transcriptText)) !== transcriptRef.contentHash) {
    throw new GenerationContextError("TRANSCRIPT_HASH_MISMATCH");
  }
  let segments;
  try {
    segments = parseTranscript(format, transcriptText);
  } catch {
    throw new GenerationContextError("INVALID_TRANSCRIPT");
  }

  const values = normalizedValues(report, fields, request.sessionId);
  let calendarContext: Record<string, unknown> = {};
  if (fields.some((field) => field.ai.allowedSources.includes("calendar"))) {
    const boundCalendarSessionId = usableCalendarSessionId(session.calendarSessionId);
    const fallbackCalendarSessionId = usableCalendarSessionId(request.sessionId);
    if (!boundCalendarSessionId && !fallbackCalendarSessionId) {
      throw new GenerationContextError("SESSION_NOT_FOUND");
    }
    const calendar = await source.getCalendarSession(
      confId,
      boundCalendarSessionId,
      fallbackCalendarSessionId ?? boundCalendarSessionId!,
    );
    if (!calendar) throw new GenerationContextError("SESSION_NOT_FOUND");
    calendarContext = fixedCalendarContext(calendar);
  }
  return {
    scope: "session",
    input: {
      template,
      fields,
      segments,
      currentValues: values,
      calendarContext,
      focus,
      mode: request.mode,
      instruction: request.instruction ?? "",
      templateHash: template.templateHash,
      transcriptHash: transcriptRef.contentHash,
      baseFieldHashes: await hashFieldMap(values),
    },
  };
}

export function createFirebaseGenerationContextSource(
  firestore: Firestore,
  storage: Bucket,
): GenerationContextSource {
  return {
    async getReport(confId, reportId) {
      const snapshot = await firestore
        .collection("conferences")
        .doc(confId)
        .collection("dailyReports")
        .doc(reportId)
        .get();
      return snapshot.exists ? ({ id: reportId, ...snapshot.data() } as Report) : null;
    },
    async getTemplate(templateId, version) {
      const snapshot = await firestore
        .collection("reportTemplates")
        .doc(templateId)
        .collection("versions")
        .doc(String(version))
        .get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async getMemberFocus(confId, uid) {
      const snapshot = await firestore
        .collection("conferences")
        .doc(confId)
        .collection("members")
        .doc(uid)
        .get();
      const focus = snapshot.exists ? snapshot.data()?.aiFocus : undefined;
      return typeof focus === "string" ? focus : "";
    },
    async getCalendarSession(confId, calendarSessionId, fallbackCode) {
      const snapshot = await firestore
        .collection("conferences")
        .doc(confId)
        .collection("sessions")
        .doc(calendarSessionId ?? fallbackCode)
        .get();
      return snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
    },
    async getTranscript(storagePath) {
      const [bytes] = await storage.file(storagePath).download();
      return new Uint8Array(bytes);
    },
  };
}

export const firebaseGenerationContextSource = createFirebaseGenerationContextSource(db, bucket);
