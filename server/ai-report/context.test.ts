import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashFieldValue, hashText } from "../../src/lib/ai-report/hash";
import type { GenerateRequest, Report, ReportTemplateVersion } from "../../src/types";
import {
  createFirebaseGenerationContextSource,
  loadGenerationContext,
  type GenerationContextSource,
} from "./context";

const template: ReportTemplateVersion = {
  templateId: "template-1",
  version: 2,
  templateHash: "template-hash",
  fields: [
    {
      id: "takeaways",
      label: "Takeaways",
      description: "Session takeaways",
      type: "rich_text",
      scope: "session",
      ai: {
        enabled: true,
        allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite", "append"],
      },
    },
    {
      id: "summaryPoints",
      label: "Summary",
      description: "Daily summary",
      type: "bullet_list",
      scope: "daily",
      ai: {
        enabled: true,
        allowedSources: ["report_content", "current_draft", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite"],
      },
    },
    {
      id: "rumorsBlocks",
      label: "Analysis",
      description: "One analysis Block",
      type: "rich_text",
      scope: "block",
      ai: {
        enabled: true,
        instruction: "Ground the analysis in the supplied sources.",
        allowedSources: ["transcript", "current_draft", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite", "append"],
        maxLength: 3000,
      },
    },
  ],
};

async function report(): Promise<Report> {
  return {
    id: "report-1",
    templateId: template.templateId,
    templateVersion: template.version,
    templateHash: template.templateHash,
    summaryPoints: ["Existing summary"],
    rumorsBlocks: [{ id: "b1", type: "body", content: "Existing analysis" }],
    sessions: {
      S101: {
        takeaways: "Existing takeaway",
        calendarSessionId: "calendar-101",
        transcriptRef: {
          storagePath: "conference-transcripts/conf-1/report-1/S101/file-1.txt",
          fileName: "file-1.txt",
          format: "txt",
          contentHash: await hashText("The speaker confirmed the launch."),
          uploadedBy: "u1",
          uploadedAt: 1,
        },
      },
    },
  };
}

function source(overrides: Partial<GenerationContextSource> = {}): GenerationContextSource {
  return {
    getReport: vi.fn(report),
    getTemplate: vi.fn(async () => template),
    getMemberFocus: vi.fn(async () => "Prioritize product strategy"),
    getCalendarSession: vi.fn(async () => ({
      code: "S101",
      title: "Launch",
      date: "2026-08-11",
      start: "09:00",
      end: "10:00",
      room: "Hall A",
      speakers: [{ name: "Ada", title: "Researcher", company: "Acme" }],
      attendees: ["private"],
    })),
    getTranscript: vi.fn(async () => new TextEncoder().encode("The speaker confirmed the launch.")),
    ...overrides,
  };
}

const sessionRequest: GenerateRequest = { scope: "session", sessionId: "S101", mode: "rewrite" };
const dailyRequest: GenerateRequest = {
  scope: "daily",
  targetFieldId: "summaryPoints",
  mode: "rewrite",
};
const blockRequest = {
  scope: "block",
  targetFieldId: "rumorsBlocks",
  blockId: "b1",
  mode: "rewrite",
} as const;

describe("loadGenerationContext", () => {
  it("loads the bound template, triggering member focus, transcript, and whitelisted calendar context", async () => {
    const read = source();
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
      read,
    );

    expect(loaded).toMatchObject({
      scope: "session",
      input: {
        templateHash: "template-hash",
        focus: "Prioritize product strategy",
        currentValues: { takeaways: "Existing takeaway" },
        calendarContext: {
          code: "S101",
          title: "Launch",
          date: "2026-08-11",
          start: "09:00",
          end: "10:00",
          room: "Hall A",
          speakers: [{ name: "Ada", title: "Researcher", company: "Acme" }],
        },
      },
    });
    expect(loaded.scope === "session" ? loaded.input.calendarContext : {}).not.toHaveProperty(
      "attendees",
    );
    expect(read.getMemberFocus).toHaveBeenCalledWith("conf-1", "u1");
    expect(read.getTranscript).toHaveBeenCalledWith(
      "conference-transcripts/conf-1/report-1/S101/file-1.txt",
    );
  });

  it("rejects a changed immutable template hash", async () => {
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        source({ getTemplate: vi.fn(async () => ({ ...template, templateHash: "changed" })) }),
      ),
    ).rejects.toMatchObject({ code: "TEMPLATE_MISMATCH", status: 409 });
  });

  it("rejects an out-of-scope transcript path before storage is read", async () => {
    const changed = await report();
    changed.sessions!.S101.transcriptRef!.storagePath =
      "conference-transcripts/conf-1/report-1/OTHER/file.txt";
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_PATH_MISMATCH" });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects a changed transcript object", async () => {
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        source({ getTranscript: vi.fn(async () => new TextEncoder().encode("Changed")) }),
      ),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_HASH_MISMATCH", status: 409 });
  });

  it("checks a changed transcript hash before parsing malformed content", async () => {
    const changed = await report();
    const reference = changed.sessions!.S101.transcriptRef!;
    reference.format = "srt";
    reference.storagePath = "conference-transcripts/conf-1/report-1/S101/file-1.srt";
    reference.contentHash = await hashText("original valid source");

    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        source({
          getReport: vi.fn(async () => changed),
          getTranscript: vi.fn(async () => new TextEncoder().encode("not a valid SRT cue")),
        }),
      ),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_HASH_MISMATCH", status: 409 });
  });

  it("sanitizes calendar fields and speaker entries to public bounded values", async () => {
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
      source({
        getCalendarSession: vi.fn(async () => ({
          code: { private: "member-1" },
          title: "A safe public title",
          date: "2026-08-11",
          start: "09:00",
          end: { recordingUrl: "private" },
          room: "Hall A",
          speakers: [
            {
              name: "Ada",
              title: { memberId: "u1" },
              company: "Acme",
              attendees: ["u1"],
            },
            { name: "x".repeat(257) },
            { recording: "https://private.example" },
          ],
        })),
      }),
    );
    if (loaded.scope !== "session") throw new Error("wrong scope");
    expect(loaded.input.calendarContext).toEqual({
      title: "A safe public title",
      date: "2026-08-11",
      start: "09:00",
      room: "Hall A",
      speakers: [{ name: "Ada", company: "Acme" }],
    });
  });

  it("uses the report session code when calendarSessionId is malformed", async () => {
    const changed = await report();
    changed.sessions!.S101.calendarSessionId = " \t ";
    const read = source({ getReport: vi.fn(async () => changed) });
    await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
      read,
    );
    expect(read.getCalendarSession).toHaveBeenCalledWith("conf-1", undefined, "S101");
  });

  it("maps a missing fallback calendar session to SESSION_NOT_FOUND", async () => {
    const changed = await report();
    changed.sessions!.S101.calendarSessionId = "";
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        source({
          getReport: vi.fn(async () => changed),
          getCalendarSession: vi.fn(async () => null),
        }),
      ),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
  });

  it.each(["S/101", "S\u0001", ""])(
    "rejects an unusable fallback calendar document ID (%j) without reading the adapter",
    async (sessionId) => {
      const changed = await report();
      const original = changed.sessions!.S101;
      changed.sessions = {
        [sessionId]: {
          ...original,
          calendarSessionId: "invalid/calendar/id",
          transcriptRef: {
            ...original.transcriptRef!,
            storagePath: `conference-transcripts/conf-1/report-1/${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}/file-1.txt`,
          },
        },
      };
      const read = source({ getReport: vi.fn(async () => changed) });
      await expect(
        loadGenerationContext(
          {
            confId: "conf-1",
            reportId: "report-1",
            uid: "u1",
            request: { scope: "session", sessionId, mode: "rewrite" },
          },
          read,
        ),
      ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
      expect(read.getCalendarSession).not.toHaveBeenCalled();
    },
  );

  it("builds daily source blocks and never reads Storage", async () => {
    const read = source();
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: dailyRequest },
      read,
    );
    expect(loaded).toMatchObject({
      scope: "daily",
      input: { currentValue: ["Existing summary"], baseFieldHashes: expect.any(Object) },
    });
    if (loaded.scope !== "daily") throw new Error("wrong scope");
    expect(loaded.input.sourceBlocks).toEqual(
      expect.arrayContaining([
        {
          sourceId: "draft:summaryPoints",
          sourceType: "current_draft",
          text: "Existing summary",
        },
      ]),
    );
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("loads authoritative draft-only body input without reading Storage", async () => {
    const read = source();
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "triggering-user", request: blockRequest },
      read,
    );

    expect(loaded).toEqual({
      scope: "block",
      input: {
        template,
        field: template.fields[2],
        targetFieldId: "rumorsBlocks",
        blockId: "b1",
        blockKind: "body",
        currentValue: "Existing analysis",
        segments: [],
        focus: "Prioritize product strategy",
        mode: "rewrite",
        instruction: "",
        templateHash: "template-hash",
        baseFieldHashes: {
          "block:rumorsBlocks:b1:content": await hashFieldValue("Existing analysis"),
        },
      },
    });
    expect(read.getMemberFocus).toHaveBeenCalledOnce();
    expect(read.getMemberFocus).toHaveBeenCalledWith("conf-1", "triggering-user");
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("loads true Transcript-only VTT input with timestamps", async () => {
    const vtt = ["WEBVTT", "", "cue-1", "00:01.000 --> 00:03.500", "A timestamped source."].join(
      "\n",
    );
    const changed = await report();
    changed.rumorsBlocks![0].content = "";
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/source-1.vtt",
      fileName: "source-1.vtt",
      format: "vtt",
      contentHash: await hashText(vtt),
      uploadedBy: "u2",
      uploadedAt: 2,
    };
    const read = source({
      getReport: vi.fn(async () => changed),
      getTranscript: vi.fn(async () => new TextEncoder().encode(vtt)),
    });

    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
      read,
    );

    if (loaded.scope !== "block") throw new Error("wrong scope");
    expect(loaded.input.currentValue).toBe("");
    expect(loaded.input.baseFieldHashes).toEqual({
      "block:rumorsBlocks:b1:content": await hashFieldValue(""),
    });
    expect(loaded.input.transcriptHash).toBe(await hashText(vtt));
    expect(loaded.input.segments).toEqual([
      expect.objectContaining({
        segmentId: "seg_0001",
        text: "A timestamped source.",
        startMs: 1000,
        endMs: 3500,
      }),
    ]);
    expect(read.getTranscript).toHaveBeenCalledWith(
      "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/source-1.vtt",
    );
  });

  it("rejects colliding sanitized Block identities before reading Storage", async () => {
    const transcript = "Bound private source";
    const changed = await report();
    changed.rumorsBlocks![0] = {
      id: "b/1",
      type: "body",
      content: "",
      transcriptRef: {
        storagePath: "conference-transcripts/conf_1/report_1/blocks/rumorsBlocks/b_1/source.txt",
        fileName: "source.txt",
        format: "txt",
        contentHash: await hashText(transcript),
        uploadedBy: "u1",
        uploadedAt: 2,
      },
    };
    const read = source({
      getReport: vi.fn(async () => changed),
      getTranscript: vi.fn(async () => new TextEncoder().encode(transcript)),
    });

    await expect(
      loadGenerationContext(
        {
          confId: "conf/1",
          reportId: "report/1",
          uid: "u1",
          request: { ...blockRequest, blockId: "b/1" },
        },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_TRANSCRIPT_PATH_MISMATCH", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it.each([
    [
      "extra path segment",
      "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/extra/source.txt",
    ],
    [
      "missing path segment",
      "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/source.txt",
    ],
    [
      "encoded separator",
      "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/file%2F1.txt",
    ],
    [
      "unknown field",
      "conference-transcripts/conf-1/report-1/blocks/arbitraryBlocks/b1/source.txt",
    ],
  ])("rejects a Block Transcript with %s before reading Storage", async (_name, storagePath) => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath,
      fileName: "source.txt",
      format: "txt",
      contentHash: await hashText("private source"),
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    const read = source({ getReport: vi.fn(async () => changed) });

    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_TRANSCRIPT_PATH_MISMATCH", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects an encoded conference identity instead of accepting its sanitized alias", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf_2F1/report-1/blocks/rumorsBlocks/b1/source.txt",
      fileName: "source.txt",
      format: "txt",
      contentHash: await hashText("private source"),
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    const read = source({ getReport: vi.fn(async () => changed) });

    await expect(
      loadGenerationContext(
        { confId: "conf%2F1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_TRANSCRIPT_PATH_MISMATCH", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("preserves scalar rich-text content for both current value and stale hash", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].content = "<p>Exact scalar draft</p>";
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
      source({ getReport: vi.fn(async () => changed) }),
    );

    if (loaded.scope !== "block") throw new Error("wrong scope");
    expect(loaded.input.currentValue).toBe("<p>Exact scalar draft</p>");
    expect(loaded.input.baseFieldHashes).toEqual({
      "block:rumorsBlocks:b1:content": await hashFieldValue("<p>Exact scalar draft</p>"),
    });
  });

  it("rejects a bound non-rich-text Block policy instead of coercing scalar content", async () => {
    const invalidTemplate = structuredClone(template);
    invalidTemplate.fields[2].type = "bullet_list";
    const read = source({ getTemplate: vi.fn(async () => invalidTemplate) });

    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "TEMPLATE_MISMATCH", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects a missing Block without reading Storage", async () => {
    const read = source();
    await expect(
      loadGenerationContext(
        {
          confId: "conf-1",
          reportId: "report-1",
          uid: "u1",
          request: { ...blockRequest, blockId: "missing" },
        },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_NOT_FOUND", status: 404 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects duplicate Block IDs without selecting either source", async () => {
    const changed = await report();
    changed.rumorsBlocks!.push({
      id: "b1",
      type: "body",
      content: "Conflicting analysis",
      transcriptRef: {
        storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/private.txt",
        fileName: "private.txt",
        format: "txt",
        contentHash: "private-hash",
        uploadedBy: "u2",
        uploadedAt: 2,
      },
    });
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_DUPLICATE", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects a non-approved Block field", async () => {
    await expect(
      loadGenerationContext(
        {
          confId: "conf-1",
          reportId: "report-1",
          uid: "u1",
          request: { ...blockRequest, targetFieldId: "sessions" } as never,
        },
        source(),
      ),
    ).rejects.toMatchObject({ code: "FIELD_NOT_ELIGIBLE", status: 400 });
  });

  it("does not select a Block with the same ID from a different approved field", async () => {
    const changedTemplate: ReportTemplateVersion = {
      ...template,
      fields: [
        ...template.fields,
        { ...template.fields[2], id: "onsiteInfoBlocks", label: "Onsite information" },
      ],
    };
    await expect(
      loadGenerationContext(
        {
          confId: "conf-1",
          reportId: "report-1",
          uid: "u1",
          request: { ...blockRequest, targetFieldId: "onsiteInfoBlocks" },
        },
        source({ getTemplate: vi.fn(async () => changedTemplate) }),
      ),
    ).rejects.toMatchObject({ code: "BLOCK_NOT_FOUND", status: 404 });
  });

  it("rejects append mode for a heading Block", async () => {
    const changed = await report();
    changed.rumorsBlocks![0] = { id: "b1", type: "heading", content: "Market signal" };
    await expect(
      loadGenerationContext(
        {
          confId: "conf-1",
          reportId: "report-1",
          uid: "u1",
          request: { ...blockRequest, mode: "append" },
        },
        source({ getReport: vi.fn(async () => changed) }),
      ),
    ).rejects.toMatchObject({ code: "FIELD_NOT_ELIGIBLE", status: 400 });
  });

  it("rejects a Block Transcript path bound to a sibling target before reading Storage", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/sibling/source.txt",
      fileName: "source.txt",
      format: "txt",
      contentHash: await hashText("private source"),
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_TRANSCRIPT_PATH_MISMATCH", status: 409 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects changed Block Transcript content before parsing", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/source.vtt",
      fileName: "source.vtt",
      format: "vtt",
      contentHash: await hashText("original valid source"),
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        source({
          getReport: vi.fn(async () => changed),
          getTranscript: vi.fn(async () => new TextEncoder().encode("not valid VTT")),
        }),
      ),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_HASH_MISMATCH", status: 409 });
  });

  it("rejects a mismatched Block Transcript extension before reading Storage", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/source.txt",
      fileName: "source.txt",
      format: "vtt",
      contentHash: await hashText("private source"),
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSCRIPT", status: 400 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects non-UTF-8 Block Transcript bytes", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].transcriptRef = {
      storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/source.txt",
      fileName: "source.txt",
      format: "txt",
      contentHash: "unreachable-hash",
      uploadedBy: "u1",
      uploadedAt: 2,
    };
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        source({
          getReport: vi.fn(async () => changed),
          getTranscript: vi.fn(async () => Uint8Array.from([0xc3, 0x28])),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSCRIPT", status: 400 });
  });

  it("rejects a matching Block with an unsupported kind before reading Storage", async () => {
    const changed = await report();
    changed.rumorsBlocks![0] = {
      id: "b1",
      type: "body",
      content: "Existing analysis",
      transcriptRef: {
        storagePath: "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/b1/private.txt",
        fileName: "private.txt",
        format: "txt",
        contentHash: "private-hash",
        uploadedBy: "u1",
        uploadedAt: 2,
      },
    };
    (changed.rumorsBlocks![0] as { type: string }).type = "image";
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "BLOCK_NOT_FOUND", status: 404 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("rejects an empty Block draft with no Transcript", async () => {
    const changed = await report();
    changed.rumorsBlocks![0].content = " \t\n ";
    const read = source({ getReport: vi.fn(async () => changed) });
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: blockRequest },
        read,
      ),
    ).rejects.toMatchObject({ code: "TRANSCRIPT_REQUIRED", status: 400 });
    expect(read.getTranscript).not.toHaveBeenCalled();
  });

  it("normalizes stored target values before hashing every session target", async () => {
    const loaded = await loadGenerationContext(
      { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
      source(),
    );
    if (loaded.scope !== "session") throw new Error("wrong scope");
    expect(loaded.input.baseFieldHashes).toEqual({
      takeaways: await hashFieldValue("Existing takeaway"),
    });
  });

  it.each([
    ["missing report", source({ getReport: vi.fn(async () => null) }), "REPORT_NOT_FOUND"],
    ["missing template", source({ getTemplate: vi.fn(async () => null) }), "TEMPLATE_NOT_FOUND"],
    [
      "missing session",
      source({ getReport: vi.fn(async () => ({ ...(await report()), sessions: {} })) }),
      "SESSION_NOT_FOUND",
    ],
    [
      "missing transcript",
      source({
        getReport: vi.fn(async () => ({
          ...(await report()),
          sessions: { S101: { takeaways: "x" } },
        })),
      }),
      "TRANSCRIPT_REQUIRED",
    ],
  ])("maps %s to a stable typed error", async (_name, read, code) => {
    await expect(
      loadGenerationContext(
        { confId: "conf-1", reportId: "report-1", uid: "u1", request: sessionRequest },
        read,
      ),
    ).rejects.toMatchObject({ code });
  });
});

describe("firebaseGenerationContextSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the exact Firestore and Storage paths", async () => {
    const reads: string[] = [];
    const node = (path: string[]): Record<string, unknown> => ({
      collection: (name: string) => node([...path, name]),
      doc: (id: string) => node([...path, id]),
      get: async () => {
        reads.push(path.join("/"));
        return { exists: true, data: () => ({ aiFocus: "focus" }) };
      },
    });
    const collection = vi.fn((name: string) => node([name]));
    const download = vi.fn(async () => [Buffer.from("source")]);
    const file = vi.fn(() => ({ download }));
    const source = createFirebaseGenerationContextSource(
      { collection } as never,
      { file } as never,
    );

    await source.getReport("conf-1", "report-1");
    await source.getTemplate("template-1", 2);
    await source.getMemberFocus("conf-1", "u1");
    await source.getCalendarSession("conf-1", "calendar-101", "S101");
    await source.getTranscript("conference-transcripts/conf-1/report-1/S101/file-1.txt");

    expect(reads).toEqual([
      "conferences/conf-1/dailyReports/report-1",
      "reportTemplates/template-1/versions/2",
      "conferences/conf-1/members/u1",
      "conferences/conf-1/sessions/calendar-101",
    ]);
    expect(file).toHaveBeenCalledWith("conference-transcripts/conf-1/report-1/S101/file-1.txt");
    expect(download).toHaveBeenCalledOnce();
  });
});
