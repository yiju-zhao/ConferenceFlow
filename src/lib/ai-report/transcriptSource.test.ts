import { describe, expect, it } from "vitest";
import { buildTranscriptStoragePath, prepareTranscript } from "./transcriptSource";

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
});
