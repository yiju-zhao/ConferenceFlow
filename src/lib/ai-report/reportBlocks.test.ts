import { describe, expect, it } from "vitest";
import type { ReportBlock, TranscriptRef } from "../../types";
import { blocksWithoutTranscripts, replaceReportBlock } from "./reportBlocks";

const transcriptRef: TranscriptRef = {
  storagePath: "transcripts/b1.txt",
  fileName: "b1.txt",
  format: "txt",
  contentHash: "hash",
  uploadedBy: "u1",
  uploadedAt: 1,
};

function body(id: string, content: string): ReportBlock {
  return { id, type: "body", content };
}

describe("blocksWithoutTranscripts", () => {
  it("removes only private Transcript references from snapshot Blocks", () => {
    expect(
      blocksWithoutTranscripts([
        {
          id: "b1",
          type: "body",
          content: "正文",
          transcriptRef,
          ownerId: "u1",
          sourceSessions: [{ id: "S1", manual: "" }],
        },
      ]),
    ).toEqual([
      {
        id: "b1",
        type: "body",
        content: "正文",
        ownerId: "u1",
        sourceSessions: [{ id: "S1", manual: "" }],
      },
    ]);
  });
});

describe("replaceReportBlock", () => {
  it("patches exactly one Block without changing sibling identity", () => {
    const blocks = [body("b1", "A"), body("b2", "B")];

    const result = replaceReportBlock(blocks, "b1", { content: "新内容" });

    expect(result).toEqual([body("b1", "新内容"), body("b2", "B")]);
    expect(result[1]).toBe(blocks[1]);
  });

  it("rejects an update for a missing Block", () => {
    expect(() => replaceReportBlock([body("b1", "A")], "missing", { content: "B" })).toThrow(
      "report Block not found",
    );
  });
});
