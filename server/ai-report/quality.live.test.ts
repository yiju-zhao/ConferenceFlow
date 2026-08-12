// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { hashFieldMap, hashText } from "../../src/lib/ai-report/hash";
import type { GenerateResponse, ReportTemplateVersion, TranscriptFormat } from "../../src/types";
import { generateSessionCandidate } from "./generate-session";
import { parseTranscript } from "./transcript-parser";

const liveDescribe = process.env.RUN_LIVE_AI_EVAL === "1" ? describe : describe.skip;

const LIVE_TEMPLATE: ReportTemplateVersion = {
  templateId: "ai-quality-fixture",
  version: 1,
  templateHash: "ai-quality-fixture-v1",
  fields: [
    {
      id: "takeaways",
      label: "核心结论",
      description: "会议明确表达且可由原文验证的关键事实",
      type: "rich_text",
      scope: "session",
      ai: {
        enabled: true,
        allowedSources: ["transcript", "current_draft", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite", "append"],
        maxLength: 800,
      },
    },
    {
      id: "insights",
      label: "深度研判",
      description: "基于会议证据形成的影响与判断",
      type: "rich_text",
      scope: "session",
      ai: {
        enabled: true,
        allowedSources: ["transcript", "current_draft", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite", "append"],
        maxLength: 800,
      },
    },
  ],
};

async function runFixtureThroughSessionPipeline(fileName: string): Promise<GenerateResponse> {
  const text = await readFile(new URL(`./__fixtures__/${fileName}`, import.meta.url), "utf8");
  const format = fileName.split(".").pop() as TranscriptFormat;
  const currentValues = { takeaways: "", insights: "" };
  return generateSessionCandidate({
    template: LIVE_TEMPLATE,
    fields: LIVE_TEMPLATE.fields,
    segments: parseTranscript(format, text),
    currentValues,
    calendarContext: { title: "AI Quality Fixture" },
    focus: "关注可验证的成本、性能和生态影响",
    mode: "rewrite",
    instruction: "优先保留数字和限制条件",
    templateHash: LIVE_TEMPLATE.templateHash,
    transcriptHash: await hashText(text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")),
    baseFieldHashes: await hashFieldMap(currentValues),
  });
}

liveDescribe("DeepSeek AI report quality fixtures", () => {
  it.each([
    "short.txt",
    "long.md",
    "timestamps.srt",
    "timestamps.vtt",
    "mixed-language.txt",
    "names-numbers.txt",
    "contradictory.txt",
    "insufficient.txt",
    "prompt-injection.txt",
    "focus-relevant.md",
  ])("returns schema-valid, source-backed output for %s", async (fileName) => {
    const result = await runFixtureThroughSessionPipeline(fileName);
    for (const field of result.candidate) {
      expect(field.evidenceIds.length).toBeGreaterThan(0);
      expect(
        field.evidenceIds.every((id) => result.evidence.some((evidence) => evidence.id === id)),
      ).toBe(true);
    }
  });
});
