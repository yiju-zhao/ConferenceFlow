import { useCallback } from "react";
import { buildBlockTranscriptStoragePath } from "../lib/ai-report/transcriptSource";
import type { AiBlockField, TranscriptRef } from "../types";
import {
  usePrivateTranscriptSource,
  type TranscriptSourceActions,
} from "./usePrivateTranscriptSource";

export interface UseBlockTranscriptSourceOptions {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  blockId: string;
  current: TranscriptRef | null | undefined;
  uid: string;
  commitReference(next: TranscriptRef | null): Promise<void>;
}

export function useBlockTranscriptSource({
  confId,
  reportId,
  targetFieldId,
  blockId,
  current,
  uid,
  commitReference,
}: UseBlockTranscriptSourceOptions): TranscriptSourceActions {
  const buildStoragePath = useCallback(
    (fileId: string, format: TranscriptRef["format"]) =>
      buildBlockTranscriptStoragePath(confId, reportId, targetFieldId, blockId, fileId, format),
    [blockId, confId, reportId, targetFieldId],
  );

  return usePrivateTranscriptSource({
    current,
    uid,
    buildStoragePath,
    commitReference,
  });
}
