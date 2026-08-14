import { useCallback } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { buildTranscriptStoragePath } from "../lib/ai-report/transcriptSource";
import type { TranscriptRef } from "../types";
import {
  usePrivateTranscriptSource,
  type TranscriptSourceActions,
} from "./usePrivateTranscriptSource";

export type { TranscriptSourceActions } from "./usePrivateTranscriptSource";

interface UseTranscriptSourceOptions {
  confId: string;
  reportId: string;
  sessionId: string;
  current: TranscriptRef | null | undefined;
  uid: string;
}

export function useTranscriptSource({
  confId,
  reportId,
  sessionId,
  current,
  uid,
}: UseTranscriptSourceOptions): TranscriptSourceActions {
  const buildStoragePath = useCallback(
    (fileId: string, format: TranscriptRef["format"]) =>
      buildTranscriptStoragePath(confId, reportId, sessionId, fileId, format),
    [confId, reportId, sessionId],
  );
  const commitReference = useCallback(
    async (next: TranscriptRef | null) => {
      await setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        { sessions: { [sessionId]: { transcriptRef: next } } },
        { merge: true },
      );
    },
    [confId, reportId, sessionId],
  );

  return usePrivateTranscriptSource({ current, uid, buildStoragePath, commitReference });
}
