import { describe, expect, it } from "vitest";
import type { ReportBlock, TranscriptRef } from "../../types";
import {
  blocksWithoutTranscripts,
  hasVisibleBlockContent,
  insertReportBlock,
  removeReportBlock,
  replaceReportBlock,
} from "./reportBlocks";

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

  it("rejects an adoption patch when server-latest content differs", () => {
    expect(() =>
      replaceReportBlock([body("b1", "new manual edit")], "b1", { content: "AI result" }, "old"),
    ).toThrow("report Block content changed");
  });

  it("accepts an adoption patch when server-latest content matches", () => {
    expect(replaceReportBlock([body("b1", "old")], "b1", { content: "AI result" }, "old")).toEqual([
      body("b1", "AI result"),
    ]);
  });
});

describe("insertReportBlock", () => {
  it("inserts at the start without changing sibling identity", () => {
    const blocks = [body("b1", "A"), body("b2", "B")];
    const inserted = body("new", "New");

    const result = insertReportBlock(blocks, inserted, null);

    expect(result).toEqual([inserted, ...blocks]);
    expect(result[1]).toBe(blocks[0]);
    expect(result[2]).toBe(blocks[1]);
  });

  it("inserts after exactly one anchor and preserves order", () => {
    const blocks = [body("b1", "A"), body("b2", "B")];
    const inserted = body("new", "New");

    expect(insertReportBlock(blocks, inserted, "b1")).toEqual([blocks[0], inserted, blocks[1]]);
  });

  it("rejects missing and duplicate anchors", () => {
    expect(() => insertReportBlock([body("b1", "A")], body("new", "New"), "missing")).toThrow(
      "report Block anchor not found",
    );
    expect(() =>
      insertReportBlock([body("b1", "A"), body("b1", "duplicate")], body("new", "New"), "b1"),
    ).toThrow("report Block anchor not found");
  });

  it("rejects a duplicate new Block ID", () => {
    expect(() => insertReportBlock([body("b1", "A")], body("b1", "New"), null)).toThrow(
      "report Block already exists",
    );
  });
});

describe("removeReportBlock", () => {
  it("removes exactly one target without changing sibling identity", () => {
    const blocks = [body("b1", "A"), body("b2", "B"), body("b3", "C")];

    const result = removeReportBlock(blocks, "b2");

    expect(result).toEqual([blocks[0], blocks[2]]);
    expect(result[0]).toBe(blocks[0]);
    expect(result[1]).toBe(blocks[2]);
  });

  it("rejects missing and duplicate targets", () => {
    expect(() => removeReportBlock([body("b1", "A")], "missing")).toThrow("report Block not found");
    expect(() => removeReportBlock([body("b1", "A"), body("b1", "duplicate")], "b1")).toThrow(
      "report Block not found",
    );
  });
});

describe("hasVisibleBlockContent", () => {
  it.each(["", "   \n\t", "<p><br></p>"])("rejects an empty editor value %#", (content) => {
    expect(hasVisibleBlockContent(body("b1", content))).toBe(false);
  });

  it.each(["正文", "<p>正文</p>"])("accepts visible Block content %#", (content) => {
    expect(hasVisibleBlockContent(body("b1", content))).toBe(true);
  });
});
