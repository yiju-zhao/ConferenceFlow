import { describe, expect, it } from "vitest";
import { AI_BLOCK_FIELDS } from "../../types";
import { assertTemplateVersion } from "./templateContract";
import {
  buildBlockTranscriptStoragePath,
  parseBlockTranscriptStoragePath,
} from "./transcriptSource";

function trendBlocksTemplate() {
  return {
    templateId: "academic-conference-daily-report",
    version: 1,
    templateHash: "0".repeat(64),
    fields: [
      {
        id: "trendBlocks",
        label: "趋势研判",
        description: "记录方向性信号与方法论 shift。",
        type: "rich_text",
        scope: "block",
        ai: {
          enabled: true,
          instruction: "按观察证据、合理推断、潜在影响组织内容。",
          allowedSources: ["transcript", "current_draft", "user_focus"],
          evidenceRequired: true,
          allowedModes: ["rewrite", "append"],
          maxLength: 3000,
        },
      },
    ],
  };
}

describe("trendBlocks block field", () => {
  it("is a registered AI block field", () => {
    expect(AI_BLOCK_FIELDS).toContain("trendBlocks");
  });

  it("passes template contract validation as a block field", () => {
    const template = assertTemplateVersion(trendBlocksTemplate());
    expect(template.fields[0].id).toBe("trendBlocks");
  });

  it("builds and parses block transcript storage paths", () => {
    const path = buildBlockTranscriptStoragePath(
      "conf1",
      "report1",
      "trendBlocks",
      "block1",
      "file1",
      "md",
    );
    expect(path).toBe("conference-transcripts/conf1/report1/blocks/trendBlocks/block1/file1.md");
    expect(parseBlockTranscriptStoragePath(path)).toEqual({
      confId: "conf1",
      reportId: "report1",
      targetFieldId: "trendBlocks",
      blockId: "block1",
      fileId: "file1",
      format: "md",
    });
  });
});
