import { act, render, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
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

function GenerateAfterRebind({
  active,
  generate,
}: {
  active: boolean;
  generate: (request: GenerateRequest) => Promise<void>;
}) {
  useLayoutEffect(() => {
    if (active) void generate(sessionRequest);
  }, [active, generate]);
  return null;
}

function RebindHarness({
  confId,
  reportId,
  startGeneration,
  onState,
}: {
  confId: string;
  reportId: string;
  startGeneration: boolean;
  onState: (state: ReturnType<typeof useAiGeneration>) => void;
}) {
  const state = useAiGeneration(confId, reportId);
  onState(state);
  return <GenerateAfterRebind active={startGeneration} generate={state.generate} />;
}

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

  it("clears and aborts work when the report identity changes", async () => {
    let resolveOldRequest!: (response: GenerateResponse) => void;
    apiFetchMock.mockResolvedValueOnce(candidateResponse).mockReturnValueOnce(
      new Promise<GenerateResponse>((resolve) => {
        resolveOldRequest = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ confId, reportId }: { confId: string; reportId: string }) =>
        useAiGeneration(confId, reportId),
      { initialProps: { confId: "conf-1", reportId: "report-1" } },
    );

    await act(async () => result.current.generate(sessionRequest));
    expect(result.current.response).toEqual(candidateResponse);

    act(() => void result.current.generate(sessionRequest));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    rerender({ confId: "conf-2", reportId: "report-2" });

    expect(result.current).toMatchObject({
      phase: "idle",
      response: null,
      error: null,
      retryable: false,
    });

    await act(async () => resolveOldRequest(candidateResponse));
    expect(result.current).toMatchObject({ phase: "idle", response: null });
  });

  it("preserves a new-identity generation started by a descendant layout effect", async () => {
    let resolveNewRequest!: (response: GenerateResponse) => void;
    apiFetchMock.mockReturnValueOnce(
      new Promise<GenerateResponse>((resolve) => {
        resolveNewRequest = resolve;
      }),
    );
    apiFetchMock.mockResolvedValueOnce(candidateResponse);
    let latest!: ReturnType<typeof useAiGeneration>;
    const onState = (state: ReturnType<typeof useAiGeneration>) => {
      latest = state;
    };
    const { rerender } = render(
      <RebindHarness
        confId="conf-1"
        reportId="report-1"
        startGeneration={false}
        onState={onState}
      />,
    );

    rerender(
      <RebindHarness confId="conf-2" reportId="report-2" startGeneration onState={onState} />,
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce());
    expect(latest.phase).toBe("generating");

    await act(async () => resolveNewRequest(candidateResponse));
    await waitFor(() =>
      expect(latest).toMatchObject({ phase: "preview", response: candidateResponse }),
    );

    await act(async () => latest.regenerate());
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[1]?.[0]).toBe(
      "/api/conferences/conf-2/reports/report-2/ai/generate",
    );
  });
});
