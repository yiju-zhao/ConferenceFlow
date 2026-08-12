import { useCallback, useState } from "react";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase";
import { prepareTranscript } from "../lib/ai-report/transcriptSource";
import type { TranscriptFormat, TranscriptRef } from "../types";

export interface TranscriptSourceActions {
  busy: boolean;
  error: string | null;
  saveFile(file: File): Promise<TranscriptRef>;
  savePaste(text: string): Promise<TranscriptRef>;
  loadText(): Promise<string>;
  remove(): Promise<void>;
}

export interface UsePrivateTranscriptSourceOptions {
  current: TranscriptRef | null | undefined;
  uid: string;
  buildStoragePath(fileId: string, format: TranscriptFormat): string;
  commitReference(next: TranscriptRef | null): Promise<void>;
}

function operationMessage(error: unknown): string {
  return error instanceof Error ? error.message : "transcript operation failed";
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("could not read transcript"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });
}

export function usePrivateTranscriptSource({
  current,
  uid,
  buildStoragePath,
  commitReference,
}: UsePrivateTranscriptSourceOptions): TranscriptSourceActions {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitPrepared = useCallback(
    async (fileName: string, bytes: Uint8Array): Promise<TranscriptRef> => {
      const prepared = await prepareTranscript(fileName, bytes);
      const fileId = crypto.randomUUID();
      const storagePath = buildStoragePath(fileId, prepared.format);
      const uploadedObject = ref(storage, storagePath);
      const nextRef: TranscriptRef = {
        storagePath,
        fileName,
        format: prepared.format,
        contentHash: prepared.contentHash,
        uploadedBy: uid,
        uploadedAt: Date.now(),
      };

      await uploadBytes(
        uploadedObject,
        new Blob([prepared.text], { type: "text/plain;charset=utf-8" }),
        { contentType: "text/plain;charset=utf-8" },
      );

      try {
        await commitReference(nextRef);
      } catch (commitError) {
        try {
          await deleteObject(uploadedObject);
        } catch {
          // The committed reference was never changed; cleanup is best effort.
        }
        throw commitError;
      }

      if (current) {
        try {
          await deleteObject(ref(storage, current.storagePath));
        } catch {
          // The committed reference is authoritative; stale private objects can be retried later.
        }
      }

      return nextRef;
    },
    [buildStoragePath, commitReference, current, uid],
  );

  const saveFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        return await commitPrepared(file.name, await readFileBytes(file));
      } catch (saveError) {
        setError(operationMessage(saveError));
        throw saveError;
      } finally {
        setBusy(false);
      }
    },
    [commitPrepared],
  );

  const savePaste = useCallback(
    async (text: string) => {
      setBusy(true);
      setError(null);
      try {
        return await commitPrepared("pasted-transcript.txt", new TextEncoder().encode(text));
      } catch (saveError) {
        setError(operationMessage(saveError));
        throw saveError;
      } finally {
        setBusy(false);
      }
    },
    [commitPrepared],
  );

  const loadText = useCallback(async () => {
    if (!current) throw new Error("no transcript");
    setBusy(true);
    setError(null);
    try {
      const bytes = await getBytes(ref(storage, current.storagePath));
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("transcript must be valid UTF-8");
      }
    } catch (loadError) {
      setError(operationMessage(loadError));
      throw loadError;
    } finally {
      setBusy(false);
    }
  }, [current]);

  const remove = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await commitReference(null);
      try {
        await deleteObject(ref(storage, current.storagePath));
      } catch {
        // The reference is cleared first; an orphaned private object is not exposed publicly.
      }
    } catch (removeError) {
      setError(operationMessage(removeError));
      throw removeError;
    } finally {
      setBusy(false);
    }
  }, [commitReference, current]);

  return { busy, error, saveFile, savePaste, loadText, remove };
}
