import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePrivateTranscriptSource } from "./usePrivateTranscriptSource";
import type { TranscriptRef } from "../types";

const { mockDeleteObject, mockGetBytes, mockRef, mockUploadBytes, storage } = vi.hoisted(() => ({
  mockDeleteObject: vi.fn(),
  mockGetBytes: vi.fn(),
  mockRef: vi.fn((_: unknown, fullPath: string) => ({ fullPath })),
  mockUploadBytes: vi.fn(),
  storage: {},
}));

vi.mock("firebase/storage", () => ({
  deleteObject: mockDeleteObject,
  getBytes: mockGetBytes,
  ref: mockRef,
  uploadBytes: mockUploadBytes,
}));

vi.mock("../firebase", () => ({ storage }));

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

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}

function renderSource(
  current: TranscriptRef | null | undefined = null,
  commitReference = vi.fn(async (_next: TranscriptRef | null) => undefined),
) {
  return {
    commitReference,
    ...renderHook(() =>
      usePrivateTranscriptSource({
        current,
        uid: "u1",
        buildStoragePath: (fileId, format) => `private/${fileId}.${format}`,
        commitReference,
      }),
    ),
  };
}

describe("usePrivateTranscriptSource", () => {
  beforeEach(() => {
    mockDeleteObject.mockReset();
    mockGetBytes.mockReset();
    mockRef.mockClear();
    mockUploadBytes.mockReset();
    mockDeleteObject.mockResolvedValue(undefined);
    mockUploadBytes.mockResolvedValue(undefined);
  });

  it("uploads normalized UTF-8 text before committing its reference", async () => {
    const { result, commitReference } = renderSource();

    await act(async () => {
      await result.current.saveFile(new File(["first\r\nsecond"], "new.txt"));
    });

    const blob = mockUploadBytes.mock.calls[0][1] as Blob;
    expect(await readBlobText(blob)).toBe("first\nsecond");
    expect(mockUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
      commitReference.mock.invocationCallOrder[0],
    );
  });

  it("deletes the new object and retains the old reference when commit fails", async () => {
    const current = transcriptRef("private/old.txt");
    const commitReference = vi.fn(async () => {
      throw new Error("commit failed");
    });
    const { result } = renderSource(current, commitReference);

    await act(async () => {
      await expect(result.current.saveFile(new File(["new"], "new.txt"))).rejects.toThrow(
        "commit failed",
      );
    });

    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(commitReference.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteObject.mock.invocationCallOrder[0],
    );
    expect(mockDeleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ fullPath: expect.stringMatching(/^private\/.+\.txt$/) }),
    );
    expect(mockDeleteObject.mock.calls[0][0]).toBe(mockUploadBytes.mock.calls[0][0]);
    expect(mockDeleteObject.mock.calls[0][0].fullPath).not.toBe(current.storagePath);
    expect(commitReference).toHaveBeenCalledWith(expect.objectContaining({ fileName: "new.txt" }));
  });

  it("best-effort deletes the previous object after a successful replacement commit", async () => {
    const current = transcriptRef("private/old.txt");
    const { result, commitReference } = renderSource(current);

    await act(async () => {
      await result.current.saveFile(new File(["new"], "new.txt"));
    });

    expect(commitReference.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteObject.mock.invocationCallOrder[0],
    );
    expect(mockDeleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ fullPath: current.storagePath }),
    );
  });

  it("commits null before best-effort object deletion on removal", async () => {
    const current = transcriptRef("private/old.txt");
    const { result, commitReference } = renderSource(current);
    mockDeleteObject.mockRejectedValueOnce(new Error("delete failed"));

    await act(async () => {
      await result.current.remove();
    });

    expect(commitReference).toHaveBeenCalledWith(null);
    expect(commitReference.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteObject.mock.invocationCallOrder[0],
    );
  });

  it("loads valid UTF-8 text and rejects invalid bytes", async () => {
    const { result, rerender } = renderSource(transcriptRef("private/current.txt"));
    mockGetBytes.mockResolvedValueOnce(new TextEncoder().encode("你好"));

    await act(async () => {
      await expect(result.current.loadText()).resolves.toBe("你好");
    });

    mockGetBytes.mockResolvedValueOnce(new Uint8Array([0xff]));
    await act(async () => {
      await expect(result.current.loadText()).rejects.toThrow("transcript must be valid UTF-8");
    });
    rerender();
    expect(result.current.error).toBe("transcript must be valid UTF-8");
  });
});
