import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBlockTranscriptSource } from "./useBlockTranscriptSource";
import type { TranscriptRef } from "../types";

const { mockRef, mockUploadBytes, storage } = vi.hoisted(() => ({
  mockRef: vi.fn((_: unknown, fullPath: string) => ({ fullPath })),
  mockUploadBytes: vi.fn(),
  storage: {},
}));

vi.mock("firebase/storage", () => ({
  deleteObject: vi.fn(),
  getBytes: vi.fn(),
  ref: mockRef,
  uploadBytes: mockUploadBytes,
}));

vi.mock("../firebase", () => ({ storage }));

describe("useBlockTranscriptSource", () => {
  beforeEach(() => {
    mockRef.mockClear();
    mockUploadBytes.mockReset();
    mockUploadBytes.mockResolvedValue(undefined);
  });

  it("uses caller-injected persistence for a Block-scoped reference", async () => {
    const commitReference = vi.fn(async (_next: TranscriptRef | null) => undefined);
    const { result } = renderHook(() =>
      useBlockTranscriptSource({
        confId: "conf-1",
        reportId: "report_1",
        targetFieldId: "rumorsBlocks",
        blockId: "block.1",
        current: null,
        uid: "u1",
        commitReference,
      }),
    );

    await act(async () => {
      await result.current.saveFile(new File(["source"], "new.txt"));
    });

    expect(commitReference).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: expect.stringMatching(
          /^conference-transcripts\/conf-1\/report_1\/blocks\/rumorsBlocks\/block\.1\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.txt$/,
        ),
      }),
    );
    expect(mockUploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
      commitReference.mock.invocationCallOrder[0],
    );
  });
});
