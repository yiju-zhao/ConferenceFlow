import { describe, expect, it } from "vitest";
import {
  buildBlockTranscriptStoragePath,
  buildTranscriptStoragePath,
  isBlockTranscriptPathId,
  parseBlockTranscriptStoragePath,
  prepareTranscript,
} from "./transcriptSource";

describe("transcript source validation", () => {
  it("normalizes UTF-8 line endings and hashes the normalized text", async () => {
    const prepared = await prepareTranscript(
      "talk.vtt",
      new TextEncoder().encode("WEBVTT\r\n\r\n00:00.000 --> 00:02.000\r\n你好"),
    );

    expect(prepared.format).toBe("vtt");
    expect(prepared.text).toContain("WEBVTT\n\n");
    expect(prepared.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["talk.pdf", "talk.docx", "talk.csv"])("rejects unsupported %s input", async (name) => {
    await expect(prepareTranscript(name, new TextEncoder().encode("text"))).rejects.toThrow(
      "unsupported transcript format",
    );
  });

  it("rejects invalid UTF-8 and empty normalized text", async () => {
    await expect(prepareTranscript("talk.txt", new Uint8Array([0xff]))).rejects.toThrow("UTF-8");
    await expect(prepareTranscript("talk.txt", new TextEncoder().encode(" \n "))).rejects.toThrow(
      "empty transcript",
    );
  });

  it("rejects normalized text above 500000 Unicode code points", async () => {
    await expect(
      prepareTranscript("talk.txt", new TextEncoder().encode("中".repeat(500_001))),
    ).rejects.toThrow("transcript exceeds 500000 code points");
  });

  it("builds a conference/report/Session-scoped random path", () => {
    expect(buildTranscriptStoragePath("conf-1", "2026-08-11", "S/101", "id-1", "txt")).toBe(
      "conference-transcripts/conf-1/2026-08-11/S_101/id-1.txt",
    );
  });

  it("builds an exact Block Transcript path without transforming accepted IDs", () => {
    expect(
      buildBlockTranscriptStoragePath(
        "conf-1",
        "report_1",
        "rumorsBlocks",
        "block.1",
        "file-1",
        "vtt",
      ),
    ).toBe("conference-transcripts/conf-1/report_1/blocks/rumorsBlocks/block.1/file-1.vtt");
  });

  const invalidPathIds = [
    "",
    ".",
    "..",
    "value/part",
    "value%2Fpart",
    "value part",
    "区块1",
    `b${"x".repeat(128)}`,
  ];
  const identityPositions = ["confId", "reportId", "blockId", "fileId"] as const;

  it.each(
    identityPositions.flatMap((position) => invalidPathIds.map((value) => [position, value])),
  )("rejects unsafe %s identity %j", (position, value) => {
    expect(isBlockTranscriptPathId(value)).toBe(false);
    const identities = {
      confId: "conf-1",
      reportId: "report-1",
      blockId: "block-1",
      fileId: "file-1",
      [position]: value,
    };
    expect(() =>
      buildBlockTranscriptStoragePath(
        identities.confId,
        identities.reportId,
        "rumorsBlocks",
        identities.blockId,
        identities.fileId,
        "vtt",
      ),
    ).toThrow("invalid Block Transcript path identity");
    const pathSegments = [
      "conference-transcripts",
      identities.confId,
      identities.reportId,
      "blocks",
      "rumorsBlocks",
      identities.blockId,
      `${identities.fileId}.vtt`,
    ];
    expect(parseBlockTranscriptStoragePath(pathSegments.join("/"))).toBeNull();
  });

  it("rejects a slash identity instead of colliding with an underscore identity", () => {
    expect(() =>
      buildBlockTranscriptStoragePath("conf-1", "report-1", "rumorsBlocks", "b/1", "file-1", "txt"),
    ).toThrow("invalid Block Transcript path identity");
    expect(
      buildBlockTranscriptStoragePath("conf-1", "report-1", "rumorsBlocks", "b_1", "file-1", "txt"),
    ).toBe("conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b_1/file-1.txt");
  });

  it("parses exactly seven valid Block Transcript path segments", () => {
    expect(
      parseBlockTranscriptStoragePath(
        "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file.one.vtt",
      ),
    ).toEqual({
      confId: "conf-1",
      reportId: "report-1",
      targetFieldId: "rumorsBlocks",
      blockId: "block-1",
      fileId: "file.one",
      format: "vtt",
    });
  });

  it.each([
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file-1.vtt/extra",
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/file-1.vtt",
    "private-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file-1.vtt",
    "conference-transcripts/conf-1/report-1/sections/rumorsBlocks/block-1/file-1.vtt",
    "conference-transcripts/conf-1/report-1/blocks/arbitraryBlocks/block-1/file-1.vtt",
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block%2F1/file-1.vtt",
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file%2F1.vtt",
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file-1.pdf",
    "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file-1",
  ])("rejects malformed Block Transcript path %s", (path) => {
    expect(parseBlockTranscriptStoragePath(path)).toBeNull();
  });

  it.each([
    ["arbitraryBlocks", "vtt"],
    ["rumorsBlocks", "pdf"],
  ])("rejects invalid runtime field/format %s %s", (targetFieldId, format) => {
    expect(() =>
      buildBlockTranscriptStoragePath(
        "conf-1",
        "report-1",
        targetFieldId as never,
        "block-1",
        "file-1",
        format as never,
      ),
    ).toThrow("invalid Block Transcript path identity");
  });
});
