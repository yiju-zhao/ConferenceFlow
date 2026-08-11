export const DEEPSEEK_MODEL = "deepseek-v4-flash";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 45_000;

export interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

export type JsonDecoder<T> = (value: unknown) => T;

export class DeepSeekRequestError extends Error {
  constructor(
    message: string,
    public readonly code: "CONFIG" | "CANCELLED" | "TIMEOUT" | "HTTP" | "EMPTY" | "INVALID_JSON",
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

function isCallerCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function requestError(
  code: DeepSeekRequestError["code"],
  retryable: boolean,
  status?: number,
): DeepSeekRequestError {
  switch (code) {
    case "CONFIG":
      return new DeepSeekRequestError("DeepSeek API key is not configured", code, retryable);
    case "CANCELLED":
      return new DeepSeekRequestError("DeepSeek request cancelled", code, retryable);
    case "TIMEOUT":
      return new DeepSeekRequestError("DeepSeek request timed out", code, retryable);
    case "EMPTY":
      return new DeepSeekRequestError("DeepSeek response was empty", code, retryable, status);
    case "INVALID_JSON":
      return new DeepSeekRequestError(
        "DeepSeek response was invalid JSON",
        code,
        retryable,
        status,
      );
    case "HTTP":
      return new DeepSeekRequestError(
        status === undefined
          ? "DeepSeek request failed"
          : `DeepSeek request failed with status ${status}`,
        code,
        retryable,
        status,
      );
  }
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

function responseContent(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const response = value as DeepSeekResponse;
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function requestAttempt<T>(
  apiKey: string,
  messages: DeepSeekMessage[],
  decode: JsonDecoder<T>,
  callerSignal: AbortSignal | undefined,
): Promise<T> {
  if (isCallerCancelled(callerSignal)) throw requestError("CANCELLED", false);

  const controller = new AbortController();
  let timedOut = false;
  let callerCancelled = false;
  const onCallerAbort = () => {
    callerCancelled = true;
    controller.abort();
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ATTEMPT_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch {
      if (callerCancelled || isCallerCancelled(callerSignal)) {
        throw requestError("CANCELLED", false);
      }
      if (timedOut) throw requestError("TIMEOUT", true);
      throw requestError("HTTP", true);
    }

    if (!response.ok) {
      const retryable =
        response.status === 429 || (response.status >= 500 && response.status < 600);
      throw requestError("HTTP", retryable, response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (callerCancelled || isCallerCancelled(callerSignal)) {
        throw requestError("CANCELLED", false);
      }
      if (timedOut) throw requestError("TIMEOUT", true);
      throw requestError("INVALID_JSON", true, response.status);
    }

    const content = responseContent(payload);
    if (!content.trim()) throw requestError("EMPTY", true, response.status);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw requestError("INVALID_JSON", true, response.status);
    }

    try {
      return decode(parsed);
    } catch {
      throw requestError("INVALID_JSON", true, response.status);
    }
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

export async function requestDeepSeekJson<T>(
  messages: DeepSeekMessage[],
  decode: JsonDecoder<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!process.env.DEEPSEEK_API_KEY) throw requestError("CONFIG", false);
  if (isCallerCancelled(signal)) throw requestError("CANCELLED", false);

  let lastError: DeepSeekRequestError | undefined;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      return await requestAttempt(process.env.DEEPSEEK_API_KEY, messages, decode, signal);
    } catch (error) {
      const safeError = error instanceof DeepSeekRequestError ? error : requestError("HTTP", true);
      lastError = safeError;
      if (!safeError.retryable || attempt === ATTEMPTS - 1) throw safeError;
      if (isCallerCancelled(signal)) throw requestError("CANCELLED", false);
    }
  }

  throw lastError ?? requestError("HTTP", true);
}
