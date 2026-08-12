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
  const identity = `${confId}\u0000${reportId}`;
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [response, setResponse] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [stateIdentity, setStateIdentity] = useState(identity);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRequestIdentityRef = useRef<string | null>(null);
  const lastRequestRef = useRef<{ identity: string; request: GenerateRequest } | null>(null);
  const identityRef = useRef(identity);
  const stateIdentityRef = useRef(identity);
  const mountedRef = useRef(true);
  identityRef.current = identity;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const hasNewIdentityState =
      activeRequestIdentityRef.current === identity ||
      lastRequestRef.current?.identity === identity ||
      stateIdentityRef.current === identity;
    if (hasNewIdentityState) return;

    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRequestIdentityRef.current = null;
    lastRequestRef.current = null;
    stateIdentityRef.current = identity;
    setStateIdentity(identity);
    setPhase("idle");
    setResponse(null);
    setError(null);
    setRetryable(false);
  }, [identity]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRequestIdentityRef.current = null;
    lastRequestRef.current = null;
    stateIdentityRef.current = identityRef.current;
    setStateIdentity(stateIdentityRef.current);
    setPhase("idle");
    setResponse(null);
    setError(null);
    setRetryable(false);
  }, []);

  const generate = useCallback(
    async (request: GenerateRequest) => {
      const requestIdentity = identity;
      if (controllerRef.current) {
        if (activeRequestIdentityRef.current === requestIdentity) return;
        controllerRef.current.abort();
        controllerRef.current = null;
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      activeRequestIdentityRef.current = requestIdentity;
      lastRequestRef.current = { identity: requestIdentity, request };
      stateIdentityRef.current = requestIdentity;
      setStateIdentity(requestIdentity);
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
        if (
          !mountedRef.current ||
          identityRef.current !== requestIdentity ||
          controllerRef.current !== controller
        )
          return;
        setResponse(nextResponse);
        setPhase("preview");
      } catch (caught) {
        if (
          !mountedRef.current ||
          identityRef.current !== requestIdentity ||
          controllerRef.current !== controller ||
          isAbortError(caught)
        )
          return;
        setResponse(null);
        setPhase("error");
        setError(caught instanceof ApiError ? caught.message : DEFAULT_ERROR);
        setRetryable(caught instanceof ApiError && caught.retryable);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          activeRequestIdentityRef.current = null;
        }
      }
    },
    [confId, reportId],
  );

  const regenerate = useCallback(async () => {
    if (lastRequestRef.current?.identity === identityRef.current) {
      await generate(lastRequestRef.current.request);
    }
  }, [generate]);

  const current = stateIdentity === identity;
  return {
    phase: current ? phase : "idle",
    response: current ? response : null,
    error: current ? error : null,
    retryable: current ? retryable : false,
    generate,
    regenerate,
    cancel: reset,
    reset,
  };
}
