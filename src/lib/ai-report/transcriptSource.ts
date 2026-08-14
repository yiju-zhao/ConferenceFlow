import { AI_BLOCK_FIELDS, type AiBlockField, type TranscriptFormat } from "../../types/index.js";
import { hashText } from "./hash.js";

const FORMATS = new Set<TranscriptFormat>(["txt", "md", "srt", "vtt"]);
const BLOCK_TRANSCRIPT_FIELDS = new Set<AiBlockField>(AI_BLOCK_FIELDS);
export const BLOCK_TRANSCRIPT_PATH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const MAX_TRANSCRIPT_CODE_POINTS = 500_000;

export function isBlockTranscriptPathId(value: unknown): value is string {
  return typeof value === "string" && BLOCK_TRANSCRIPT_PATH_ID_PATTERN.test(value);
}

export interface ParsedBlockTranscriptStoragePath {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  blockId: string;
  fileId: string;
  format: TranscriptFormat;
}

export async function prepareTranscript(fileName: string, bytes: Uint8Array) {
  const extension = fileName.split(".").pop()?.toLowerCase() as TranscriptFormat | undefined;
  if (!extension || !FORMATS.has(extension)) throw new Error("unsupported transcript format");

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("transcript must be valid UTF-8");
  }

  const text = decoded.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new Error("empty transcript");
  if (Array.from(text).length > MAX_TRANSCRIPT_CODE_POINTS) {
    throw new Error("transcript exceeds 500000 code points");
  }

  return { format: extension, text, contentHash: await hashText(text) };
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function buildTranscriptStoragePath(
  confId: string,
  reportId: string,
  sessionId: string,
  fileId: string,
  format: TranscriptFormat,
): string {
  return [
    "conference-transcripts",
    safePathSegment(confId),
    safePathSegment(reportId),
    safePathSegment(sessionId),
    `${safePathSegment(fileId)}.${format}`,
  ].join("/");
}

export function buildBlockTranscriptStoragePath(
  confId: string,
  reportId: string,
  targetFieldId: AiBlockField,
  blockId: string,
  fileId: string,
  format: TranscriptFormat,
): string {
  if (
    !isBlockTranscriptPathId(confId) ||
    !isBlockTranscriptPathId(reportId) ||
    !BLOCK_TRANSCRIPT_FIELDS.has(targetFieldId) ||
    !isBlockTranscriptPathId(blockId) ||
    !isBlockTranscriptPathId(fileId) ||
    !FORMATS.has(format)
  ) {
    throw new Error("invalid Block Transcript path identity");
  }
  return [
    "conference-transcripts",
    confId,
    reportId,
    "blocks",
    targetFieldId,
    blockId,
    `${fileId}.${format}`,
  ].join("/");
}

export function parseBlockTranscriptStoragePath(
  path: string,
): ParsedBlockTranscriptStoragePath | null {
  const segments = path.split("/");
  if (segments.length !== 7) return null;
  const [root, confId, reportId, namespace, targetFieldId, blockId, fileName] = segments;
  if (root !== "conference-transcripts" || namespace !== "blocks") return null;
  if (
    !isBlockTranscriptPathId(confId) ||
    !isBlockTranscriptPathId(reportId) ||
    !BLOCK_TRANSCRIPT_FIELDS.has(targetFieldId as AiBlockField) ||
    !isBlockTranscriptPathId(blockId)
  ) {
    return null;
  }
  const fileMatch = /^(.+)\.(txt|md|srt|vtt)$/.exec(fileName);
  if (!fileMatch) return null;
  const [, fileId, format] = fileMatch;
  if (!isBlockTranscriptPathId(fileId)) return null;
  return {
    confId,
    reportId,
    targetFieldId: targetFieldId as AiBlockField,
    blockId,
    fileId,
    format: format as TranscriptFormat,
  };
}
