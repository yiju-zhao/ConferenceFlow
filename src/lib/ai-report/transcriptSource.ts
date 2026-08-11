import type { TranscriptFormat } from "../../types";
import { hashText } from "./hash";

const FORMATS = new Set<TranscriptFormat>(["txt", "md", "srt", "vtt"]);
export const MAX_TRANSCRIPT_CODE_POINTS = 500_000;

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
