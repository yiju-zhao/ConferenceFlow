import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { GenerateRequest } from "../../../../../../src/types";
import { AuthError, requireMember } from "../../../../../lib/auth-middleware.js";
import {
  GenerationContextError,
  loadGenerationContext,
} from "../../../../../../server/ai-report/context.js";
import { DeepSeekRequestError } from "../../../../../../server/ai-report/deepseek.js";
import { generateDailyCandidate } from "../../../../../../server/ai-report/generate-daily.js";
import { generateSessionCandidate } from "../../../../../../server/ai-report/generate-session.js";

const MAX_ID_LENGTH = 256;
const MAX_INSTRUCTION_CODE_POINTS = 4_000;

const CONTEXT_MESSAGES: Record<string, string> = {
  REPORT_NOT_FOUND: "Report not found",
  TEMPLATE_NOT_BOUND: "Report has no immutable template binding",
  TEMPLATE_NOT_FOUND: "Bound template version not found",
  TEMPLATE_MISMATCH: "Template identity/hash changed",
  SESSION_NOT_FOUND: "Report Session or Calendar Session not found",
  TRANSCRIPT_REQUIRED: "Session transcript is required",
  TRANSCRIPT_PATH_MISMATCH: "Transcript path is outside the bound Session",
  TRANSCRIPT_HASH_MISMATCH: "Transcript changed after reference creation",
  INVALID_TRANSCRIPT: "Transcript encoding/format/size is invalid",
  FIELD_NOT_ELIGIBLE: "Target field or requested mode is not allowed",
};

class RequestValidationError extends Error {
  readonly code = "INVALID_REQUEST";
  readonly status = 400;

  constructor() {
    super("Invalid request");
    this.name = "RequestValidationError";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRouteId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validSessionId(value: unknown): value is string {
  return validRouteId(value) && value.trim().length > 0;
}

export function parseGenerateRequest(body: unknown): GenerateRequest {
  if (!isPlainRecord(body)) throw new RequestValidationError();
  const raw = body;
  if (raw.scope !== "session" && raw.scope !== "daily") throw new RequestValidationError();
  if (raw.mode !== "rewrite" && raw.mode !== "append") throw new RequestValidationError();
  if (raw.instruction !== undefined && typeof raw.instruction !== "string") {
    throw new RequestValidationError();
  }
  const allowed =
    raw.scope === "session"
      ? new Set(["scope", "sessionId", "mode", "instruction"])
      : new Set(["scope", "targetFieldId", "mode", "instruction"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new RequestValidationError();
  const instruction = typeof raw.instruction === "string" ? raw.instruction.trim() : undefined;
  if (instruction !== undefined && Array.from(instruction).length > MAX_INSTRUCTION_CODE_POINTS) {
    throw new RequestValidationError();
  }
  if (raw.scope === "session") {
    if (!validSessionId(raw.sessionId)) throw new RequestValidationError();
    return { scope: "session", sessionId: raw.sessionId.trim(), mode: raw.mode, instruction };
  }
  if (
    typeof raw.targetFieldId !== "string" ||
    raw.targetFieldId.length > MAX_ID_LENGTH ||
    !/^[A-Za-z][A-Za-z0-9_]*$/.test(raw.targetFieldId)
  ) {
    throw new RequestValidationError();
  }
  return { scope: "daily", targetFieldId: raw.targetFieldId, mode: raw.mode, instruction };
}

function requestIdFrom(req: VercelRequest): string {
  const header = req.headers["x-request-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" ? value.slice(0, 128) : "";
}

function logGenerationMetadata(metadata: {
  requestId: string;
  scope: string;
  durationMs: number;
  status: number;
  candidateCount: number;
  insufficientCount: number;
}): void {
  console.info("ai_report_generation", metadata);
}

function errorResponse(error: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  if (error instanceof AuthError) return { status: error.status, body: { error: error.message } };
  if (error instanceof RequestValidationError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  if (error instanceof GenerationContextError) {
    return {
      status: error.status,
      body: {
        error: CONTEXT_MESSAGES[error.code] ?? "Generation context is invalid",
        code: error.code,
      },
    };
  }
  if (error instanceof DeepSeekRequestError) {
    if (error.code === "CANCELLED") {
      return {
        status: 499,
        body: { error: "Request cancelled", code: error.code, retryable: false },
      };
    }
    if (error.code === "CONFIG") {
      return {
        status: 500,
        body: { error: "AI generation unavailable", code: error.code, retryable: false },
      };
    }
    return {
      status: 502,
      body: { error: "AI generation failed", code: error.code, retryable: error.retryable },
    };
  }
  return { status: 500, body: { error: "Internal server error", code: "INTERNAL" } };
}

export function sendSanitizedGenerationError(
  res: VercelResponse,
  error: unknown,
  durationMs: number,
  requestId = "",
  scope = "",
) {
  const response = errorResponse(error);
  logGenerationMetadata({
    requestId,
    scope,
    durationMs,
    status: response.status,
    candidateCount: 0,
    insufficientCount: 0,
  });
  return res.status(response.status).json(response.body);
}

function disconnectSignal(
  req: VercelRequest,
  res: VercelResponse,
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  const abortUnfinished = () => {
    if (!res.writableEnded) controller.abort();
  };
  if (req.aborted) abortRequest();
  req.on?.("aborted", abortRequest);
  res.on?.("close", abortUnfinished);
  req.socket?.on?.("close", abortUnfinished);
  return {
    signal: controller.signal,
    dispose: () => {
      req.removeListener?.("aborted", abortRequest);
      res.removeListener?.("close", abortUnfinished);
      req.socket?.removeListener?.("close", abortUnfinished);
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(req);
  const disconnect = disconnectSignal(req, res);
  let scope = "";
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const confId = req.query.confId;
    const reportId = req.query.reportId;
    if (!validRouteId(confId) || !validRouteId(reportId)) throw new RequestValidationError();
    const decoded = await requireMember(req, confId);
    const request = parseGenerateRequest(req.body);
    scope = request.scope;
    const context = await loadGenerationContext({ confId, reportId, uid: decoded.uid, request });
    const result =
      context.scope === "session"
        ? await generateSessionCandidate(context.input, disconnect.signal)
        : await generateDailyCandidate(context.input, disconnect.signal);
    logGenerationMetadata({
      requestId,
      scope,
      durationMs: Date.now() - startedAt,
      status: 200,
      candidateCount: result.candidate.length,
      insufficientCount: result.insufficientFieldIds.length,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendSanitizedGenerationError(res, error, Date.now() - startedAt, requestId, scope);
  } finally {
    disconnect.dispose();
  }
}
