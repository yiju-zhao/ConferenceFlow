import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest, GenerateResponse } from "../../../types";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("../../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
      public readonly retryable = false,
    ) {
      super(message);
    }
  },
  apiFetch: apiFetchMock,
}));

import { ApiError } from "../../../lib/api";
import { useAiGeneration } from "./useAiGeneration";

const candidateResponse: GenerateResponse = {
  candidate: [{ fieldId: "summaryPoints", value: ["核心结论"], evidenceIds: ["e1"] }],
  insufficientFieldIds: [],
  evidence: [
    {
      id: "e1",
      sourceType: "transcript",
      sourceId: "session-1",
      quote: "在同样精度下，推理成本降低约 30%。",
      startMs: 723000,
      endMs: 730000,
    },
  ],
  context: { templateHash: "template-1", baseFieldHashes: {}, focusUsed: "关注成本" },
};

const sessionRequest: GenerateRequest = {
  scope: "session",
  sessionId: "session-1",
  mode: "rewrite",
};

describe("useAiGeneration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts only the approved request shape and keeps the response in memory", async () => {
    apiFetchMock.mockResolvedValue(candidateResponse);
    const { result } = renderHook(() => useAiGeneration("conf-1", "report-1"));

    await act(async () => {
      await result.current.generate({
        scope: "daily",
        targetFieldId: "summaryPoints",
        mode: "rewrite",
        instruction: "突出成本",
      });
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/conferences/conf-1/reports/report-1/ai/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          scope: "daily",
          targetFieldId: "summaryPoints",
          mode: "rewrite",
          instruction: "突出成本",
        }),
      }),
    );
    expect(result.current.response).toEqual(candidateResponse);
    expect(result.current.phase).toBe("preview");
  });

  it("aborts and discards state on cancel", async () => {
    apiFetchMock.mockImplementation(
      (_path, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const { result } = renderHook(() => useAiGeneration("conf-1", "report-1"));

    act(() => void result.current.generate(sessionRequest));
    act(() => result.current.cancel());

    expect(result.current.response).toBeNull();
    expect(result.current.phase).toBe("idle");
  });

  it("keeps retryable API errors as a safe error state", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("AI unavailable", 502, "DEEPSEEK", true));
    const { result } = renderHook(() => useAiGeneration("conf-1", "report-1"));

    await act(async () => result.current.generate(sessionRequest));

    expect(result.current).toMatchObject({
      phase: "error",
      response: null,
      error: "AI unavailable",
      retryable: true,
    });
  });

  it("regenerates with the last request", async () => {
    apiFetchMock.mockResolvedValue(candidateResponse);
    const { result } = renderHook(() => useAiGeneration("conf-1", "report-1"));

    await act(async () => result.current.generate(sessionRequest));
    await act(async () => result.current.regenerate());

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[1]?.[1]).toMatchObject({ body: JSON.stringify(sessionRequest) });
  });

  it("aborts an active request when unmounted", async () => {
    let aborted = false;
    apiFetchMock.mockImplementation(
      (_path, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const { result, unmount } = renderHook(() => useAiGeneration("conf-1", "report-1"));

    act(() => void result.current.generate(sessionRequest));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
    unmount();

    expect(aborted).toBe(true);
  });

  it("accepts a response after React Strict Mode replays effects", async () => {
    let resolveResponse!: (response: GenerateResponse) => void;
    apiFetchMock.mockReturnValue(
      new Promise<GenerateResponse>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const { result } = renderHook(() => useAiGeneration("conf-1", "report-1"), {
      wrapper: StrictMode,
    });

    act(() => void result.current.generate(sessionRequest));
    await act(async () => resolveResponse(candidateResponse));

    expect(result.current).toMatchObject({ phase: "preview", response: candidateResponse });
  });
});
