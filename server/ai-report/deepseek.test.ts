// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeepSeekRequestError, requestDeepSeekJson, type DeepSeekMessage } from "./deepseek";

const mockFetch = vi.fn<typeof fetch>();
const originalFetch = globalThis.fetch;
let mockConsoleError: ReturnType<typeof vi.spyOn> | null = null;
const identityJson = (value: unknown) => value;
const messages: DeepSeekMessage[] = [{ role: "user", content: "Return JSON" }];

function okDeepSeekResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "deepseek-v4-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function deferredBodyResponse(init: RequestInit | undefined, rejection: unknown): Response {
  const response = okDeepSeekResponse('{"facts":[]}');
  Object.defineProperty(response, "json", {
    configurable: true,
    value: () =>
      new Promise<unknown>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(rejection), { once: true });
      }),
  });
  return response;
}

describe("requestDeepSeekJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    globalThis.fetch = mockFetch;
    process.env.DEEPSEEK_API_KEY = "test-secret";
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    vi.useRealTimers();
    mockConsoleError?.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it("requests fixed-model JSON output without logging source content", async () => {
    mockFetch.mockResolvedValue(okDeepSeekResponse('{"facts":[]}'));

    await expect(requestDeepSeekJson(messages, identityJson)).resolves.toEqual({ facts: [] });

    const request = mockFetch.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.stream).toBe(false);
    expect(request?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer test-secret",
        "Content-Type": "application/json",
      }),
    );
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it("retries once after empty content, then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(okDeepSeekResponse(""))
      .mockResolvedValueOnce(okDeepSeekResponse('{"fields":[]}'));

    await expect(requestDeepSeekJson(messages, identityJson)).resolves.toEqual({ fields: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it.each([429, 500, 503, 599])("retries status %s only once", async (status) => {
    mockFetch.mockResolvedValue(new Response("private response body", { status }));

    await expect(requestDeepSeekJson(messages, identityJson)).rejects.toMatchObject({
      code: "HTTP",
      status,
      retryable: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it("does not retry caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestDeepSeekJson(messages, identityJson, controller.signal),
    ).rejects.toMatchObject({
      code: "CANCELLED",
      retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("fails without a configured API key and does not call fetch", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    await expect(requestDeepSeekJson(messages, identityJson)).rejects.toMatchObject({
      code: "CONFIG",
      retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("does not retry a non-retryable HTTP 400", async () => {
    mockFetch.mockResolvedValue(new Response("private bad request", { status: 400 }));

    await expect(requestDeepSeekJson(messages, identityJson)).rejects.toMatchObject({
      code: "HTTP",
      status: 400,
      retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a status above the HTTP 5xx range", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 600 } as Response);

    await expect(requestDeepSeekJson(messages, identityJson)).rejects.toMatchObject({
      code: "HTTP",
      status: 600,
      retryable: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries invalid JSON once and returns a sanitized error after exhaustion", async () => {
    mockFetch
      .mockResolvedValueOnce(okDeepSeekResponse('{"private":"first"'))
      .mockResolvedValueOnce(okDeepSeekResponse('{"private":"second"'));

    const error = await requestDeepSeekJson(messages, identityJson).catch(
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(DeepSeekRequestError);
    expect(error).toMatchObject({ code: "INVALID_JSON", retryable: true });
    expect(String(error)).not.toContain("private");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries after decoder rejection and returns the decoded second response", async () => {
    mockFetch
      .mockResolvedValueOnce(okDeepSeekResponse('{"wrong":true}'))
      .mockResolvedValueOnce(okDeepSeekResponse('{"fields":["summary"]}'));
    const decode = (value: unknown) => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("fields" in value) ||
        !Array.isArray(value.fields)
      ) {
        throw new Error("invalid schema");
      }
      return value as { fields: string[] };
    };

    await expect(requestDeepSeekJson(messages, decode)).resolves.toEqual({ fields: ["summary"] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries a network failure exactly once", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("private network detail"))
      .mockRejectedValueOnce(new TypeError("private network detail"));

    const error = await requestDeepSeekJson(messages, identityJson).catch(
      (value: unknown) => value,
    );
    expect(error).toMatchObject({ code: "HTTP", retryable: true });
    expect(String(error)).not.toContain("private network detail");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("times out an attempt and retries once", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const request = requestDeepSeekJson(messages, identityJson);
    const result = expect(request).rejects.toMatchObject({ code: "TIMEOUT", retryable: true });
    await vi.advanceTimersByTimeAsync(45_000);
    await vi.advanceTimersByTimeAsync(45_000);

    await result;
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("preserves timeout classification while consuming a response body", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_input, init) =>
      Promise.resolve(
        deferredBodyResponse(init, new DOMException("private body detail", "AbortError")),
      ),
    );

    const request = requestDeepSeekJson(messages, identityJson);
    const result = expect(request).rejects.toMatchObject({ code: "TIMEOUT", retryable: true });
    await vi.advanceTimersByTimeAsync(45_000);
    await vi.advanceTimersByTimeAsync(45_000);

    await result;
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("preserves caller cancellation while consuming a response body", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation((_input, init) =>
      Promise.resolve(
        deferredBodyResponse(init, new DOMException("private body detail", "AbortError")),
      ),
    );

    const request = requestDeepSeekJson(messages, identityJson, controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: "CANCELLED", retryable: false });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
