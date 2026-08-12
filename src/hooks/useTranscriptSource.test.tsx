import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscriptSource } from "./useTranscriptSource";
import type { TranscriptRef } from "../types";

const { mockDeleteObject, mockGetBytes, mockRef, mockSetDoc, mockUploadBytes, storage } =
  vi.hoisted(() => ({
    mockDeleteObject: vi.fn(),
    mockGetBytes: vi.fn(),
    mockRef: vi.fn((_: unknown, fullPath: string) => ({ fullPath })),
    mockSetDoc: vi.fn(),
    mockUploadBytes: vi.fn(),
    storage: {},
  }));

vi.mock("firebase/storage", () => ({
  deleteObject: mockDeleteObject,
  getBytes: mockGetBytes,
  ref: mockRef,
  uploadBytes: mockUploadBytes,
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_: unknown, ...path: string[]) => ({ path })),
  setDoc: mockSetDoc,
}));

vi.mock("../firebase", () => ({ db: {}, storage }));

function transcriptRef(storagePath: string): TranscriptRef {
  return {
    storagePath,
    fileName: "old.txt",
    format: "txt",
    contentHash: "a".repeat(64),
    uploadedBy: "u1",
    uploadedAt: 1,
  };
}

describe("useTranscriptSource", () => {
  beforeEach(() => {
    mockDeleteObject.mockReset();
    mockGetBytes.mockReset();
    mockRef.mockClear();
    mockSetDoc.mockReset();
    mockUploadBytes.mockReset();
    mockUploadBytes.mockResolvedValue(undefined);
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteObject.mockResolvedValue(undefined);
  });

  it("uploads, commits, then deletes the former object", async () => {
    const current = transcriptRef("conference-transcripts/conf-1/r1/S101/old.txt");
    const { result } = renderHook(() =>
      useTranscriptSource({
        confId: "conf-1",
        reportId: "r1",
        sessionId: "S101",
        current,
        uid: "u1",
      }),
    );

    await act(async () => {
      await result.current.saveFile(new File(["新内容"], "new.txt"));
    });

    expect(mockUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetDoc.mock.invocationCallOrder[0],
    );
    expect(mockSetDoc.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteObject.mock.invocationCallOrder[0],
    );
    expect(mockDeleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ fullPath: current.storagePath }),
    );
  });

  it("removes the new upload and preserves the former reference when commit fails", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("firestore failed"));
    const current = transcriptRef("conference-transcripts/conf-1/r1/S101/old.txt");
    const { result } = renderHook(() =>
      useTranscriptSource({
        confId: "conf-1",
        reportId: "r1",
        sessionId: "S101",
        current,
        uid: "u1",
      }),
    );

    await expect(result.current.saveFile(new File(["新内容"], "new.txt"))).rejects.toThrow(
      "firestore failed",
    );

    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject.mock.calls[0][0].fullPath).not.toBe(current.storagePath);
  });

  it("clears the committed reference before best-effort deletion", async () => {
    const current = transcriptRef("conference-transcripts/conf-1/r1/S101/old.txt");
    mockDeleteObject.mockRejectedValueOnce(new Error("storage failed"));
    const { result } = renderHook(() =>
      useTranscriptSource({
        confId: "conf-1",
        reportId: "r1",
        sessionId: "S101",
        current,
        uid: "u1",
      }),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(mockSetDoc.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteObject.mock.invocationCallOrder[0],
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      { sessions: { S101: { transcriptRef: null } } },
      { merge: true },
    );
  });
});
