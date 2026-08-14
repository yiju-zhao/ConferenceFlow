import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireMemberMock,
  loadContextMock,
  generateSessionMock,
  generateDailyMock,
  generateBlockMock,
} = vi.hoisted(() => ({
  requireMemberMock: vi.fn(),
  loadContextMock: vi.fn(),
  generateSessionMock: vi.fn(),
  generateDailyMock: vi.fn(),
  generateBlockMock: vi.fn(),
}));

vi.mock("../../api/lib/auth-middleware.js", () => ({
  AuthError: class AuthError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  requireMember: requireMemberMock,
}));
vi.mock("./context.js", () => ({
  GenerationContextError: class GenerationContextError extends Error {
    public readonly status: number;

    constructor(public code: string) {
      super("PRIVATE /transcript/path PRIVATE_SOURCE_QUOTE");
      this.status = code === "BLOCK_NOT_FOUND" ? 404 : code === "TRANSCRIPT_REQUIRED" ? 400 : 409;
    }
  },
  loadGenerationContext: loadContextMock,
}));
vi.mock("./generate-session.js", () => ({
  generateSessionCandidate: generateSessionMock,
}));
vi.mock("./generate-daily.js", () => ({
  generateDailyCandidate: generateDailyMock,
}));
vi.mock("./generate-block.js", () => ({
  generateBlockCandidate: generateBlockMock,
}));
vi.mock("./deepseek.js", () => ({
  DeepSeekRequestError: class DeepSeekRequestError extends Error {
    constructor(
      message: string,
      public code: string,
      public retryable: boolean,
    ) {
      super(message);
    }
  },
}));

import handler, {
  parseGenerateRequest,
} from "../../api/conferences/[confId]/reports/[reportId]/ai/generate";

const sessionContext = {
  scope: "session" as const,
  input: {
    mode: "rewrite",
    fields: [],
    segments: [],
    currentValues: {},
    calendarContext: {},
    focus: "",
  },
};
const dailyContext = {
  scope: "daily" as const,
  input: { mode: "rewrite", field: {}, currentValue: "", sourceBlocks: [], focus: "" },
};
const blockField = {
  id: "rumorsBlocks",
  label: "深度研判",
  description: "深度研判内容块",
  type: "rich_text" as const,
  scope: "block" as const,
  ai: {
    enabled: true,
    instruction: "PRIVATE_TEMPLATE_INSTRUCTION",
    allowedSources: ["transcript" as const, "current_draft" as const, "user_focus" as const],
    evidenceRequired: true,
    allowedModes: ["rewrite" as const, "append" as const],
    maxLength: 3_000,
  },
};
const blockContext = {
  scope: "block" as const,
  input: {
    template: {
      templateId: "industry-conference-daily-report",
      version: 1,
      templateHash: "template-hash",
      fields: [blockField],
    },
    field: blockField,
    targetFieldId: "rumorsBlocks" as const,
    blockId: "b1",
    blockKind: "body" as const,
    currentValue: "PRIVATE_DRAFT_TEXT",
    segments: [
      {
        segmentId: "seg_0001",
        text: "PRIVATE_SOURCE_QUOTE",
        normalizedText: "PRIVATE_SOURCE_QUOTE",
      },
    ],
    focus: "PRIVATE_FOCUS",
    mode: "rewrite" as const,
    instruction: "PRIVATE_USER_INSTRUCTION",
    templateHash: "template-hash",
    transcriptHash: "transcript-hash",
    baseFieldHashes: { "rumorsBlocks:b1": "block-hash" },
  },
};
const candidateResponse = {
  candidate: [],
  insufficientFieldIds: [],
  evidence: [],
  context: { templateHash: "t", baseFieldHashes: {}, focusUsed: "" },
};
const blockCandidateResponse = {
  candidate: [
    {
      fieldId: "rumorsBlocks",
      value: "PRIVATE_CANDIDATE_TEXT",
      evidenceIds: ["block_ev_0001"],
    },
  ],
  insufficientFieldIds: [],
  evidence: [
    {
      id: "block_ev_0001",
      sourceType: "transcript" as const,
      sourceId: "transcript:seg_0001",
      quote: "PRIVATE_SOURCE_QUOTE",
    },
  ],
  context: {
    templateHash: "template-hash",
    transcriptHash: "transcript-hash",
    baseFieldHashes: { "rumorsBlocks:b1": "block-hash" },
    focusUsed: "PRIVATE_FOCUS",
    blockTarget: { targetFieldId: "rumorsBlocks" as const, blockId: "b1" },
  },
};

const blockRequest = {
  scope: "block",
  targetFieldId: "rumorsBlocks",
  blockId: "b1",
  mode: "rewrite",
};

const INVALID_BLOCK_IDS = [
  ["empty", ""],
  ["dot", "."],
  ["dot-dot", ".."],
  ["slash", "b/1"],
  ["encoded slash", "b%2F1"],
  ["leading whitespace", " b1"],
  ["trailing whitespace", "b1 "],
  ["interior whitespace", "b 1"],
  ["Unicode", "区块1"],
  ["control character", "b\u0007"],
  ["129 characters", `b${"x".repeat(128)}`],
] as const;

function request(
  body: unknown,
  method = "POST",
  query: { confId: string; reportId: string } = { confId: "conf-1", reportId: "report-1" },
) {
  const listeners = new Map<string, Array<() => void>>();
  return {
    method,
    body,
    query,
    headers: { authorization: "Bearer token", "x-request-id": "request-1" },
    aborted: false,
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
    }),
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) listener();
    },
  } as any;
}

function response() {
  const listeners = new Map<string, Array<() => void>>();
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      this.writableEnded = true;
      return this;
    },
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      );
    }),
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
  return res as any;
}

describe("parseGenerateRequest", () => {
  it("accepts the exact Block body and trims only its optional instruction", () => {
    expect(
      parseGenerateRequest({
        scope: "block",
        targetFieldId: "rumorsBlocks",
        blockId: "b._-Z9",
        mode: "append",
        instruction: "  关注供应链影响  ",
      }),
    ).toEqual({
      scope: "block",
      targetFieldId: "rumorsBlocks",
      blockId: "b._-Z9",
      mode: "append",
      instruction: "关注供应链影响",
    });
  });

  it("accepts the exact 128-character Block identity unchanged", () => {
    const blockId = `b${"x".repeat(127)}`;

    expect(
      parseGenerateRequest({
        scope: "block",
        targetFieldId: "onsiteInfoBlocks",
        blockId,
        mode: "rewrite",
      }),
    ).toEqual({
      scope: "block",
      targetFieldId: "onsiteInfoBlocks",
      blockId,
      mode: "rewrite",
      instruction: undefined,
    });
  });

  it.each([
    ["unknown field", { targetFieldId: "otherBlocks" }],
    ["missing target field", { targetFieldId: undefined }],
    ["missing Block ID", { blockId: undefined }],
    ["extra client content", { transcript: "client content" }],
    ["wrong mode", { mode: "delete" }],
    ["wrong Block ID type", { blockId: 1 }],
    ["wrong instruction type", { instruction: 1 }],
    ["overlong instruction", { instruction: "中".repeat(4_001) }],
  ])("rejects a Block body with %s", (_name, override) => {
    expect(() =>
      parseGenerateRequest({
        scope: "block",
        targetFieldId: "rumorsBlocks",
        blockId: "b1",
        mode: "rewrite",
        ...override,
      }),
    ).toThrow("Invalid request");
  });

  it.each(INVALID_BLOCK_IDS)("rejects a Block ID with %s", (_name, blockId) => {
    expect(() =>
      parseGenerateRequest({
        scope: "block",
        targetFieldId: "reflectionsBlocks",
        blockId,
        mode: "rewrite",
      }),
    ).toThrow("Invalid request");
  });
});

describe("POST /api/conferences/[confId]/reports/[reportId]/ai/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    requireMemberMock.mockResolvedValue({ uid: "u1" });
    loadContextMock.mockResolvedValue(sessionContext);
    generateSessionMock.mockResolvedValue(candidateResponse);
    generateBlockMock.mockResolvedValue(blockCandidateResponse);
  });

  afterEach(() => vi.restoreAllMocks());

  it("requires an approved member and returns a Session candidate", async () => {
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(requireMemberMock).toHaveBeenCalledWith(expect.anything(), "conf-1");
    expect(loadContextMock).toHaveBeenCalledWith({
      confId: "conf-1",
      reportId: "report-1",
      uid: "u1",
      request: { scope: "session", sessionId: "S101", mode: "rewrite", instruction: undefined },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(candidateResponse);
  });

  it("rejects methods other than POST before authentication", async () => {
    const res = response();
    await handler(request({}, "GET"), res);
    expect(res.statusCode).toBe(405);
    expect(requireMemberMock).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { scope: "session", sessionId: "", mode: "rewrite" },
    { scope: "daily", targetFieldId: "bad id", mode: "rewrite" },
    { scope: "daily", targetFieldId: "summaryPoints", mode: "delete" },
    { scope: "session", sessionId: "S101", mode: "rewrite", transcript: "client content" },
  ])("rejects malformed or overbroad request bodies", async (body) => {
    const res = response();
    await handler(request(body), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid request", code: "INVALID_REQUEST" });
    expect(loadContextMock).not.toHaveBeenCalled();
  });

  it("maps authentication errors without running generation", async () => {
    const { AuthError } = await import("../../api/lib/auth-middleware.js");
    requireMemberMock.mockRejectedValue(new AuthError("Approved membership required", 403));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Approved membership required" });
    expect(generateSessionMock).not.toHaveBeenCalled();
  });

  it("maps typed context errors with their stable status", async () => {
    const { GenerationContextError } = await import("./context.js");
    loadContextMock.mockRejectedValue(new GenerationContextError("TRANSCRIPT_HASH_MISMATCH"));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: "Transcript changed after reference creation",
      code: "TRANSCRIPT_HASH_MISMATCH",
    });
  });

  it("maps retryable model failures to a safe 502", async () => {
    const { DeepSeekRequestError } = await import("./deepseek.js");
    generateSessionMock.mockRejectedValue(new DeepSeekRequestError("private", "TIMEOUT", true));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "AI generation failed", code: "TIMEOUT", retryable: true });
  });

  it("dispatches daily context to the one-call daily pipeline", async () => {
    loadContextMock.mockResolvedValue(dailyContext);
    generateDailyMock.mockResolvedValue(candidateResponse);
    const res = response();
    await handler(
      request({ scope: "daily", targetFieldId: "summaryPoints", mode: "rewrite" }),
      res,
    );
    expect(generateDailyMock).toHaveBeenCalledWith(dailyContext.input, expect.anything());
    expect(generateSessionMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("dispatches Block context only to the Block pipeline and returns its candidate", async () => {
    loadContextMock.mockResolvedValue(blockContext);
    const res = response();

    await handler(request(blockRequest), res);

    expect(generateBlockMock).toHaveBeenCalledTimes(1);
    expect(generateBlockMock).toHaveBeenCalledWith(blockContext.input, expect.any(AbortSignal));
    expect(generateSessionMock).not.toHaveBeenCalled();
    expect(generateDailyMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(blockCandidateResponse);
  });

  it.each(INVALID_BLOCK_IDS)(
    "returns a sanitized request error for a Block ID with %s",
    async (_name, blockId) => {
      const res = response();

      await handler(request({ ...blockRequest, blockId }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request", code: "INVALID_REQUEST" });
      expect(loadContextMock).not.toHaveBeenCalled();
      expect(generateBlockMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["confId", "slash", "conf/1", true],
    ["confId", "encoded slash", "conf%2F1", true],
    ["confId", "whitespace", "conf 1", true],
    ["confId", "Unicode", "会议1", true],
    ["confId", "dot", ".", true],
    ["confId", "dot-dot", "..", true],
    ["confId", "empty", "", false],
    ["confId", "129 characters", `c${"x".repeat(128)}`, true],
    ["reportId", "slash", "report/1", true],
    ["reportId", "encoded slash", "report%2F1", true],
    ["reportId", "whitespace", "report 1", true],
    ["reportId", "Unicode", "日报1", true],
    ["reportId", "dot", ".", true],
    ["reportId", "dot-dot", "..", true],
    ["reportId", "empty", "", false],
    ["reportId", "129 characters", `r${"x".repeat(128)}`, true],
  ] as const)(
    "rejects unsafe Block-scope $0 containing $1 before context loading",
    async (key, _name, value, authenticated) => {
      const query = { confId: "conf-1", reportId: "report-1", [key]: value };
      const res = response();

      await handler(request(blockRequest, "POST", query), res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request", code: "INVALID_REQUEST" });
      expect(loadContextMock).not.toHaveBeenCalled();
      expect(generateBlockMock).not.toHaveBeenCalled();
      if (authenticated) expect(requireMemberMock).toHaveBeenCalledTimes(1);
      else expect(requireMemberMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Session", { scope: "session", sessionId: "S101", mode: "rewrite" }, sessionContext],
    ["daily", { scope: "daily", targetFieldId: "summaryPoints", mode: "rewrite" }, dailyContext],
  ] as const)(
    "keeps existing general route-ID compatibility for %s",
    async (_name, body, context) => {
      loadContextMock.mockResolvedValue(context);
      generateDailyMock.mockResolvedValue(candidateResponse);
      const res = response();

      await handler(request(body, "POST", { confId: "legacy/conf", reportId: "日报 1" }), res);

      expect(res.statusCode).toBe(200);
      expect(loadContextMock).toHaveBeenCalledWith(
        expect.objectContaining({ confId: "legacy/conf", reportId: "日报 1" }),
      );
    },
  );

  it.each([
    ["BLOCK_NOT_FOUND", 404, "Report Block not found"],
    ["BLOCK_DUPLICATE", 409, "Report Block identity is ambiguous"],
    ["BLOCK_TRANSCRIPT_PATH_MISMATCH", 409, "Transcript path is outside the bound Block"],
    ["TRANSCRIPT_REQUIRED", 400, "A required generation source is missing"],
  ] as const)("maps %s to its sanitized Block context error", async (code, status, message) => {
    const { GenerationContextError } = await import("./context.js");
    loadContextMock.mockRejectedValue(new GenerationContextError(code));
    const res = response();

    await handler(request(blockRequest), res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: message, code });
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE");
    expect(JSON.stringify(res.body)).not.toContain("/transcript/path");
  });

  it("logs only Block success metadata, never private inputs or output content", async () => {
    const log = vi.mocked(console.info);
    loadContextMock.mockResolvedValue(blockContext);
    const res = response();

    await handler(request({ ...blockRequest, instruction: "PRIVATE_REQUEST_INSTRUCTION" }), res);

    expect(log).toHaveBeenCalledWith("ai_report_generation", {
      requestId: "request-1",
      scope: "block",
      durationMs: expect.any(Number),
      status: 200,
      candidateCount: 1,
      insufficientCount: 0,
    });
    const logged = JSON.stringify(log.mock.calls);
    for (const secret of [
      "PRIVATE_REQUEST_INSTRUCTION",
      "PRIVATE_TEMPLATE_INSTRUCTION",
      "PRIVATE_USER_INSTRUCTION",
      "PRIVATE_FOCUS",
      "PRIVATE_DRAFT_TEXT",
      "PRIVATE_SOURCE_QUOTE",
      "PRIVATE_CANDIDATE_TEXT",
      "/transcript/path",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("logs only sanitized Block error metadata", async () => {
    const { GenerationContextError } = await import("./context.js");
    const log = vi.mocked(console.info);
    loadContextMock.mockRejectedValue(new GenerationContextError("BLOCK_TRANSCRIPT_PATH_MISMATCH"));
    const res = response();

    await handler(request({ ...blockRequest, instruction: "PRIVATE_REQUEST_INSTRUCTION" }), res);

    expect(log).toHaveBeenCalledWith("ai_report_generation", {
      requestId: "request-1",
      scope: "block",
      durationMs: expect.any(Number),
      status: 409,
      candidateCount: 0,
      insufficientCount: 0,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(log.mock.calls)).not.toContain("/transcript/path");
  });

  it("forwards disconnect cancellation to the Block generator", async () => {
    const { DeepSeekRequestError } = await import("./deepseek.js");
    let started!: () => void;
    const generating = new Promise<void>((resolve) => {
      started = resolve;
    });
    loadContextMock.mockResolvedValue(blockContext);
    generateBlockMock.mockImplementation(async (_input, signal: AbortSignal) => {
      started();
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DeepSeekRequestError("cancelled", "CANCELLED", false)),
        );
      });
    });
    const req = request(blockRequest);
    const res = response();

    const result = handler(req, res);
    await vi.waitFor(() => expect(generateBlockMock).toHaveBeenCalledTimes(1));
    await generating;
    res.emit("close");
    await result;

    expect(generateBlockMock).toHaveBeenCalledWith(blockContext.input, expect.any(AbortSignal));
    expect(generateSessionMock).not.toHaveBeenCalled();
    expect(generateDailyMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(499);
    expect(res.body).toEqual({
      error: "Request cancelled",
      code: "CANCELLED",
      retryable: false,
    });
  });

  it("cancels an in-flight generation when the response closes before completion", async () => {
    const { DeepSeekRequestError } = await import("./deepseek.js");
    let started!: () => void;
    const generating = new Promise<void>((resolve) => {
      started = resolve;
    });
    generateSessionMock.mockImplementation(async (_input, signal: AbortSignal) => {
      started();
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DeepSeekRequestError("cancelled", "CANCELLED", false)),
        );
      });
    });
    const req = request({ scope: "session", sessionId: "S101", mode: "rewrite" });
    const res = response();
    const result = handler(req, res);
    await generating;
    res.emit("close");
    await result;
    expect(res.statusCode).toBe(499);
    expect(res.body).toEqual({ error: "Request cancelled", code: "CANCELLED", retryable: false });
  });

  it("does not pre-abort after a normal completed response closes", async () => {
    let signal!: AbortSignal;
    generateSessionMock.mockImplementation(async (_input, suppliedSignal: AbortSignal) => {
      signal = suppliedSignal;
      return candidateResponse;
    });
    const req = request({ scope: "session", sessionId: "S101", mode: "rewrite" });
    const res = response();
    await handler(req, res);
    res.emit("close");
    expect(signal.aborted).toBe(false);
  });

  it("returns a sanitized 500 for unexpected failures", async () => {
    loadContextMock.mockRejectedValue(new Error("transcript text must not leak"));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error", code: "INTERNAL" });
  });
});
