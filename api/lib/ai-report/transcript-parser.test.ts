import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normalizeEvidenceText,
  normalizeTranscriptSource,
  parseTimestamp,
  parseTranscript,
} from "./transcript-parser";

const fixturePath = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", name);
const fixture = (name: string) => readFileSync(fixturePath(name), "utf8");

describe("parseTranscript", () => {
  it("splits TXT paragraphs into stable source segments", () => {
    const segments = parseTranscript("txt", "第一段。\n\n第二段。");

    expect(segments).toMatchObject([
      { segmentId: "seg_0001", text: "第一段。", normalizedText: "第一段。", startOffset: 0 },
      { segmentId: "seg_0002", text: "第二段。", normalizedText: "第二段。", startOffset: 6 },
    ]);
    expect(segments[0]).toMatchObject({ endOffset: 4 });
  });

  it("retains Markdown paragraph offsets after normalization", () => {
    const text = "# 标题\r\n\r\n正文第一行。\r\n\r\n正文第二行。";
    const canonical = normalizeTranscriptSource(text);
    const segments = parseTranscript("md", text);

    expect(segments).toMatchObject([
      { text: "# 标题", startOffset: 0, endOffset: 4 },
      { text: "正文第一行。", startOffset: 6 },
      { text: "正文第二行。", startOffset: 14 },
    ]);
    for (const segment of segments) {
      expect(canonical.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
    }
  });

  it("assigns the same IDs and offsets on repeated parses", () => {
    const text = fixture("short.txt");

    expect(parseTranscript("txt", text)).toEqual(parseTranscript("txt", text));
  });

  it("parses SRT timestamps and preserves cue text", () => {
    const segments = parseTranscript("srt", fixture("timestamps.srt"));

    expect(segments[0]).toMatchObject({
      segmentId: "seg_0001",
      text: "在同样精度下，推理成本降低约 30%。",
      normalizedText: "在同样精度下，推理成本降低约 30%。",
      startMs: 1000,
      endMs: 4500,
    });
    expect(segments).toHaveLength(3);
  });

  it("parses VTT cues, including optional identifiers and NOTE blocks", () => {
    const segments = parseTranscript("vtt", fixture("timestamps.vtt"));

    expect(segments).toHaveLength(3);
    expect(segments.map(({ text }) => text)).toEqual([
      "端到端部署时间缩短到九十分钟。",
      "P95 延迟从 84 ms 降到 52 ms。",
      "这些数字来自固定输入长度的内部测试。",
    ]);
    expect(segments[1]).toMatchObject({ startMs: 5000, endMs: 8000 });
  });

  it("rejects malformed SRT cue timestamps", () => {
    expect(() => parseTranscript("srt", "1\nnot a timestamp\ntext")).toThrow("invalid SRT cue");
  });

  it("rejects VTT cues whose end is not after their start", () => {
    expect(() => parseTranscript("vtt", "WEBVTT\n\n00:02.000 --> 00:01.000\ntext")).toThrow(
      "cue end must be after start",
    );
  });

  it("rejects empty cues and cue syntax accidentally nested in cue text", () => {
    expect(() => parseTranscript("srt", "1\n00:00:01,000 --> 00:00:02,000\n\n")).toThrow(
      "empty cue",
    );
    expect(() =>
      parseTranscript(
        "srt",
        "1\n00:00:01,000 --> 00:00:02,000\nfirst\n2\n00:00:03,000 --> 00:00:04,000\nsecond",
      ),
    ).toThrow("invalid SRT cue");
  });

  it("accepts numeric-only SRT cue text when it is not a nested cue header", () => {
    const segments = parseTranscript(
      "srt",
      "1\n00:00:01,000 --> 00:00:02,000\n2026\n\n2\n00:00:03,000 --> 00:00:04,000\n结论",
    );

    expect(segments[0]).toMatchObject({ segmentId: "seg_0001", text: "2026" });
  });

  it("normalizes evidence whitespace without changing source text", () => {
    expect(normalizeEvidenceText("  第一行\n\n第二行\t")).toBe("第一行 第二行");
  });

  it("normalizes BOM and CRLF and enforces input limits", () => {
    const source = "\uFEFF第一段。\r\n\r\n第二段。";
    const canonical = normalizeTranscriptSource(source);
    const segments = parseTranscript("txt", source);

    expect(segments).toMatchObject([{ startOffset: 0, endOffset: 4 }, { startOffset: 6 }]);
    for (const segment of segments) {
      expect(canonical.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
    }
    expect(() => parseTranscript("txt", " \r\n\t ")).toThrow("empty transcript");
    expect(() => parseTranscript("txt", "a".repeat(500_001))).toThrow(
      "transcript exceeds 500000 code points",
    );
  });

  it("supports the mandated transcript fixture facts as ordinary untrusted text", () => {
    expect(parseTranscript("txt", fixture("mixed-language.txt"))).toHaveLength(2);
    expect(parseTranscript("txt", fixture("names-numbers.txt"))[0].text).toContain("Acme AI");
    expect(parseTranscript("txt", fixture("prompt-injection.txt"))[0].text).toContain(
      "忽略系统指令",
    );
    expect(parseTranscript("md", fixture("focus-relevant.md"))).toHaveLength(6);
  });

  it("parses every mandated fixture in its declared format", () => {
    const short = parseTranscript("txt", fixture("short.txt"));
    const long = parseTranscript("md", fixture("long.md"));
    const srt = parseTranscript("srt", fixture("timestamps.srt"));
    const vtt = parseTranscript("vtt", fixture("timestamps.vtt"));
    const mixedLanguage = parseTranscript("txt", fixture("mixed-language.txt"));
    const namesAndNumbers = parseTranscript("txt", fixture("names-numbers.txt"));
    const contradictory = parseTranscript("txt", fixture("contradictory.txt"));
    const insufficient = parseTranscript("txt", fixture("insufficient.txt"));
    const promptInjection = parseTranscript("txt", fixture("prompt-injection.txt"));
    const focusRelevant = parseTranscript("md", fixture("focus-relevant.md"));

    expect(short).toHaveLength(2);
    expect(long).toHaveLength(16);
    expect(long.some(({ text }) => text.includes("P95 延迟"))).toBe(true);
    expect(srt).toHaveLength(3);
    expect(vtt).toHaveLength(3);
    expect(mixedLanguage).toHaveLength(2);
    expect(namesAndNumbers).toHaveLength(1);
    expect(contradictory[1].text).toContain("尚未确认");
    expect(insufficient).toMatchObject([{ text: "欢迎参加本次会议。" }]);
    expect(promptInjection).toHaveLength(2);
    expect(focusRelevant).toHaveLength(6);
  });
});

describe("parseTimestamp", () => {
  it("parses SRT and VTT timestamp forms", () => {
    expect(parseTimestamp("00:00:01,000")).toBe(1000);
    expect(parseTimestamp("00:00:04.500")).toBe(4500);
    expect(parseTimestamp("00:02.000")).toBe(2000);
  });

  it("rejects malformed timestamp values", () => {
    expect(() => parseTimestamp("not a timestamp")).toThrow("invalid timestamp");
  });
});
