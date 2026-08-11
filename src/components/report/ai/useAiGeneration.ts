import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../../../lib/api";
import type { GenerateRequest, GenerateResponse } from "../../../types";

export type GenerationPhase = "idle" | "generating" | "preview" | "error";

export interface UseAiGenerationResult {
  phase: GenerationPhase;
  response: GenerateResponse | null;
  error: string | null;
  retryable: boolean;
  generate(request: GenerateRequest): Promise<void>;
  regenerate(): Promise<void>;
  cancel(): void;
  reset(): void;
}

const DEFAULT_ERROR = "Unable to generate the report.";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useAiGeneration(confId: string, reportId: string): UseAiGenerationResult {
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [response, setResponse] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<GenerateRequest | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastRequestRef.current = null;
    setPhase("idle");
    setResponse(null);
    setError(null);
    setRetryable(false);
  }, []);

  const generate = useCallback(
    async (request: GenerateRequest) => {
      if (controllerRef.current) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      lastRequestRef.current = request;
      setPhase("generating");
      setResponse(null);
      setError(null);
      setRetryable(false);

      try {
        const nextResponse = await apiFetch<GenerateResponse>(
          `/api/conferences/${confId}/reports/${reportId}/ai/generate`,
          {
            method: "POST",
            body: JSON.stringify(request),
            signal: controller.signal,
          },
        );
        if (!mountedRef.current || controllerRef.current !== controller) return;
        setResponse(nextResponse);
        setPhase("preview");
      } catch (caught) {
        if (!mountedRef.current || controllerRef.current !== controller || isAbortError(caught))
          return;
        setResponse(null);
        setPhase("error");
        setError(caught instanceof ApiError ? caught.message : DEFAULT_ERROR);
        setRetryable(caught instanceof ApiError && caught.retryable);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [confId, reportId],
  );

  const regenerate = useCallback(async () => {
    if (lastRequestRef.current) {
      await generate(lastRequestRef.current);
    }
  }, [generate]);

  return { phase, response, error, retryable, generate, regenerate, cancel: reset, reset };
}
