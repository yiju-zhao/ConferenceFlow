export type TranscriptFormat = "txt" | "md" | "srt" | "vtt";

export interface TranscriptSegment {
  segmentId: string;
  text: string;
  normalizedText: string;
  startOffset?: number;
  endOffset?: number;
  startMs?: number;
  endMs?: number;
}

const MAX_TRANSCRIPT_CODE_POINTS = 500_000;
const TIMESTAMP_RANGE = /^(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/;

/** Normalize only whitespace so the original segment text remains available for evidence quotes. */
export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Parse a single SRT (comma) or VTT (dot) timestamp into milliseconds. */
export function parseTimestamp(value: string): number {
  const full = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value);
  if (full) {
    const [, hours, minutes, seconds, milliseconds] = full;
    return (
      Number(hours) * 60 * 60 * 1000 +
      Number(minutes) * 60 * 1000 +
      Number(seconds) * 1000 +
      Number(milliseconds)
    );
  }

  const short = /^(\d+):([0-5]\d)\.(\d{3})$/.exec(value);
  if (short) {
    const [, minutes, seconds, milliseconds] = short;
    return Number(minutes) * 60 * 1000 + Number(seconds) * 1000 + Number(milliseconds);
  }

  throw new Error("invalid timestamp");
}

function normalizeTranscript(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) throw new Error("empty transcript");
  if (Array.from(normalized).length > MAX_TRANSCRIPT_CODE_POINTS) {
    throw new Error("transcript exceeds 500000 code points");
  }
  return normalized;
}

function segmentId(index: number): string {
  return `seg_${String(index + 1).padStart(4, "0")}`;
}

function trimmedRange(value: string): { text: string; start: number; end: number } | null {
  const text = value.trim();
  if (!text) return null;
  const leading = value.length - value.trimStart().length;
  return { text, start: leading, end: leading + text.length };
}

function parseParagraphs(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const separator = /\n(?:[ \t]*\n)+/g;
  let blockStart = 0;
  let match: RegExpExecArray | null;

  const addBlock = (block: string, sourceStart: number) => {
    const range = trimmedRange(block);
    if (!range) return;
    segments.push({
      segmentId: segmentId(segments.length),
      text: range.text,
      normalizedText: normalizeEvidenceText(range.text),
      startOffset: sourceStart + range.start,
      endOffset: sourceStart + range.end,
    });
  };

  while ((match = separator.exec(text))) {
    addBlock(text.slice(blockStart, match.index), blockStart);
    blockStart = match.index + match[0].length;
  }
  addBlock(text.slice(blockStart), blockStart);
  if (!segments.length) throw new Error("empty transcript");
  return segments;
}

function parseCueTiming(line: string, format: "srt" | "vtt"): { startMs: number; endMs: number } {
  const match = TIMESTAMP_RANGE.exec(line.trim());
  if (!match || (format === "srt" && line.trim() !== `${match[1]} --> ${match[2]}`)) {
    throw new Error(`invalid ${format.toUpperCase()} cue`);
  }
  const timestampPattern =
    format === "srt"
      ? /^\d+:[0-5]\d:[0-5]\d,\d{3}$/
      : /^(?:\d+:[0-5]\d:[0-5]\d|\d+:[0-5]\d)\.\d{3}$/;
  if (!timestampPattern.test(match[1]) || !timestampPattern.test(match[2])) {
    throw new Error(`invalid ${format.toUpperCase()} cue`);
  }
  let startMs: number;
  let endMs: number;
  try {
    startMs = parseTimestamp(match[1]);
    endMs = parseTimestamp(match[2]);
  } catch {
    throw new Error(`invalid ${format.toUpperCase()} cue`);
  }
  if (endMs <= startMs) throw new Error("cue end must be after start");
  return { startMs, endMs };
}

function looksLikeCueTiming(line: string): boolean {
  return line.includes("-->");
}

function parseSrt(text: string): TranscriptSegment[] {
  const lines = text.split("\n");
  const segments: TranscriptSegment[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;

    if (!/^\d+$/.test(lines[index].trim())) throw new Error("invalid SRT cue");
    index += 1;
    if (index >= lines.length) throw new Error("invalid SRT cue");
    const timing = parseCueTiming(lines[index], "srt");
    index += 1;

    const cueLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index];
      if (/^\d+$/.test(current.trim())) throw new Error("invalid SRT cue");
      if (looksLikeCueTiming(current)) throw new Error("invalid SRT cue");
      cueLines.push(current);
      index += 1;
    }
    const cueText = cueLines.join("\n").trim();
    if (!cueText) throw new Error("empty cue");
    segments.push({
      segmentId: segmentId(segments.length),
      text: cueText,
      normalizedText: normalizeEvidenceText(cueText),
      startMs: timing.startMs,
      endMs: timing.endMs,
    });
  }

  if (!segments.length) throw new Error("empty transcript");
  return segments;
}

function parseVtt(text: string): TranscriptSegment[] {
  const lines = text.split("\n");
  if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0]?.trim() ?? "")) {
    throw new Error("invalid VTT header");
  }

  const segments: TranscriptSegment[] = [];
  let index = 1;
  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;

    if (/^NOTE(?:[ \t]|$)/.test(lines[index])) {
      index += 1;
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }

    let timingLine = lines[index];
    if (!looksLikeCueTiming(timingLine)) {
      index += 1;
      if (index >= lines.length) throw new Error("invalid VTT cue");
      timingLine = lines[index];
    }
    const timing = parseCueTiming(timingLine, "vtt");
    index += 1;

    const cueLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (looksLikeCueTiming(lines[index])) throw new Error("invalid VTT cue");
      cueLines.push(lines[index]);
      index += 1;
    }
    const cueText = cueLines.join("\n").trim();
    if (!cueText) throw new Error("empty cue");
    segments.push({
      segmentId: segmentId(segments.length),
      text: cueText,
      normalizedText: normalizeEvidenceText(cueText),
      startMs: timing.startMs,
      endMs: timing.endMs,
    });
  }

  if (!segments.length) throw new Error("empty transcript");
  return segments;
}

export function parseTranscript(format: TranscriptFormat, text: string): TranscriptSegment[] {
  const normalized = normalizeTranscript(text);
  switch (format) {
    case "txt":
    case "md":
      return parseParagraphs(normalized);
    case "srt":
      return parseSrt(normalized);
    case "vtt":
      return parseVtt(normalized);
    default:
      throw new Error("unsupported transcript format");
  }
}
