import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMemberMock, loadContextMock, generateSessionMock, generateDailyMock } = vi.hoisted(
  () => ({
    requireMemberMock: vi.fn(),
    loadContextMock: vi.fn(),
    generateSessionMock: vi.fn(),
    generateDailyMock: vi.fn(),
  }),
);

vi.mock("../../../../../lib/auth-middleware.js", () => ({
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
vi.mock("../../../../../lib/ai-report/context.js", () => ({
  GenerationContextError: class GenerationContextError extends Error {
    constructor(
      public code: string,
      public status = 409,
      message = "safe",
    ) {
      super(message);
    }
  },
  loadGenerationContext: loadContextMock,
}));
vi.mock("../../../../../lib/ai-report/generate-session.js", () => ({
  generateSessionCandidate: generateSessionMock,
}));
vi.mock("../../../../../lib/ai-report/generate-daily.js", () => ({
  generateDailyCandidate: generateDailyMock,
}));
vi.mock("../../../../../lib/ai-report/deepseek.js", () => ({
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

import handler from "./generate";

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
const candidateResponse = {
  candidate: [],
  insufficientFieldIds: [],
  evidence: [],
  context: { templateHash: "t", baseFieldHashes: {}, focusUsed: "" },
};

function request(body: unknown, method = "POST") {
  return {
    method,
    body,
    query: { confId: "conf-1", reportId: "report-1" },
    headers: { authorization: "Bearer token", "x-request-id": "request-1" },
    on: vi.fn(),
  } as any;
}

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
  return res as any;
}

describe("POST /api/conferences/[confId]/reports/[reportId]/ai/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMemberMock.mockResolvedValue({ uid: "u1" });
    loadContextMock.mockResolvedValue(sessionContext);
    generateSessionMock.mockResolvedValue(candidateResponse);
  });

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
    const { AuthError } = await import("../../../../../lib/auth-middleware.js");
    requireMemberMock.mockRejectedValue(new AuthError("Approved membership required", 403));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Approved membership required" });
    expect(generateSessionMock).not.toHaveBeenCalled();
  });

  it("maps typed context errors with their stable status", async () => {
    const { GenerationContextError } = await import("../../../../../lib/ai-report/context.js");
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
    const { DeepSeekRequestError } = await import("../../../../../lib/ai-report/deepseek.js");
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

  it("returns a sanitized 500 for unexpected failures", async () => {
    loadContextMock.mockRejectedValue(new Error("transcript text must not leak"));
    const res = response();
    await handler(request({ scope: "session", sessionId: "S101", mode: "rewrite" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error", code: "INTERNAL" });
  });
});
